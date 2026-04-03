import { initializeApp, getApps, cert } from 'firebase-admin/app';
import crypto from 'crypto';

import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { GoogleGenAI } from '@google/genai';

// --- Firebase Admin Initialization (Modular ESM-native sub-packages) ---
let initError: string | null = null;

try {
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      initError = 'FIREBASE_SERVICE_ACCOUNT environment variable is not set on this Vercel deployment.';
    } else {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({ credential: cert(serviceAccount) });
    }
  }
} catch (e: any) {
  initError = 'Fatal Init Error: ' + (e?.message ?? String(e));
}

// Lazy-initialize service handles
const getDB = () => getFirestore();
const getAuthService = () => getAuth();
const getMessagingService = () => getMessaging();

let ai: GoogleGenAI;
try {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
} catch (e: any) {
  console.error('Failed to init GenAI:', e);
}

// Helper to handle AI JSON responses with potential markdown backticks
const parseAIResponse = (text: string, defaultValue: any = []) => {
  if (!text) return defaultValue;
  try {
    // Remove markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("AI Parse Error. Original text snippet:", text.substring(0, 100));
    return defaultValue;
  }
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (initError) {
    return res.status(500).json({ error: 'Server Boot Error: ' + initError });
  }

  const db = getDB();
  const action = req.query.action || req.body?.action;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split('Bearer ')[1].trim();
    let uid = '';
    let email = '';

    if (token.startsWith('cdR_')) {
      const apiKeyDoc = await db.collection('apiKeys').doc(token).get();
      if (!apiKeyDoc.exists) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
      }
      uid = apiKeyDoc.data()?.uid;
      const userDoc = await db.collection('users').doc(uid).get();
      email = (userDoc.data()?.email || '').toLowerCase();
    } else {
      let decodedToken: any;
      try {
        decodedToken = await getAuthService().verifyIdToken(token);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized: Token verification failed' });
      }

      uid = decodedToken.uid;
      email = (decodedToken.email || '').toLowerCase();
    }
    // CENTRALIZED USER CONTEXT
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data() || {};
    const primaryUid = userData.clientId || uid;
    const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
    const isAdmin = userData.role === 'admin' || email === ADMIN_EMAIL;

    const PM_ROLES = ['project_manager', 'senior_pm', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator', 'pm'];

    // Multi-tenancy check function to ensure strict tenant isolation
    const isAuthorizedForContext = async (contextId: string) => {
      if (!contextId) return false;
      if (isAdmin) return true;

      // Check if it's a project
      const projectDoc = await db.collection('projects').doc(contextId).get();
      if (projectDoc.exists) {
        const project = projectDoc.data() || {};
        // Owner or assigned Root Client Admin
        if (project.userId === uid || project.clientId === primaryUid) return true;
        
        // Peer user in same organization
        if (userData.clientId && project.clientId === userData.clientId) return true;
        
        // Legacy check for peer PM/ClientAdmin accessing organization project if clientId is not present
        if (!project.clientId) {
           const projectOwnerDoc = await db.collection('users').doc(project.userId).get();
           if (projectOwnerDoc.exists && (projectOwnerDoc.data()?.clientId === primaryUid || projectOwnerDoc.id === primaryUid)) return true;
        }
      }

      // Check if it's a programme
      const progDoc = await db.collection('programmes').doc(contextId).get();
      if (progDoc.exists) {
        const prog = progDoc.data() || {};
        if (prog.clientId === primaryUid || prog.userId === uid) return true;
      }

      return false;
    };

    if (req.method === 'POST') {

      if (action === 'generateApiKey') {
        const { name } = req.body;
        // Generate a random 32 character hex string
        const cryptoContent = crypto.randomBytes(32).toString('hex');
        const token = `cdR_${cryptoContent}`;

        await db.collection('apiKeys').doc(token).set({
          uid,
          name: name || 'API Key',
          createdAt: new Date().toISOString()
        });

        db.collection('activityLogs').add({ type: 'api_key_created', uid, email, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true, key: token });
      }

      if (action === 'getApiKeys') {
        const snap = await db.collection('apiKeys').where('uid', '==', uid).get();
        // Do not return the full key to the frontend for security, only a preview
        const keys = snap.docs.map(doc => {
          const fullKey = doc.id;
          return {
            id: fullKey,
            name: doc.data().name || 'API Key',
            createdAt: doc.data().createdAt,
            prefix: fullKey.substring(0, 8) + '...' + fullKey.substring(fullKey.length - 4)
          };
        });
        return res.status(200).json({ success: true, keys });
      }

      if (action === 'revokeApiKey') {
        const { keyId } = req.body;
        if (!keyId) return res.status(400).json({ error: 'Missing keyId' });

        const keyDoc = await db.collection('apiKeys').doc(keyId).get();
        if (keyDoc.exists && keyDoc.data()?.uid === uid) {
          await db.collection('apiKeys').doc(keyId).delete();
          db.collection('activityLogs').add({ type: 'api_key_revoked', uid, email, timestamp: new Date().toISOString() }).catch(console.error);
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'createProject') {
        const data = req.body?.data;
        if (!data) return res.status(400).json({ error: 'Missing data' });

        // If a projectManagerId is provided, that user becomes the "owner" (userId) 
        // who sees it in their primary project list.
        const ownerId = data.projectManagerId || uid;

        // Resolve clientId for the project
        const creatorDoc = await db.collection('users').doc(uid).get();
        const creatorData = creatorDoc.data() || {};
        const isSuperAdmin = creatorData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';

        // For client admins, the project belongs to their organization (their own uid)
        // For PMs, it belongs to their parent client admin's organization
        const projectClientId = isSuperAdmin ? (data.clientId || '') : (creatorData.role === 'client_admin' ? uid : (creatorData.clientId || uid));

        const docRef = await db.collection('projects').add({
          ...data,
          userId: ownerId,
          clientId: projectClientId,
          creatorId: uid,
          createdAt: FieldValue.serverTimestamp()
        });

        // Handle Project Manager Invitations
        if (data.pmEmails && typeof data.pmEmails === 'string') {
          const emails = data.pmEmails.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
          for (const pmEmail of emails) {
            await db.collection('invitations').add({
              email: pmEmail,
              invitedBy: uid,
              role: 'project_manager',
              projectId: docRef.id,
              createdAt: FieldValue.serverTimestamp()
            });
          }
        }

        // Log activity
        db.collection('activityLogs').add({ type: 'project_created', uid, email, projectId: docRef.id, projectName: data.name || 'Unnamed', timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true, id: docRef.id });
      }

      if (action === 'getProjects' || action === 'clientGetProjects') {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const primaryUid = userData.clientId || uid;

        // Fetch ALL projects matching organization Root ID as primary check
        // This is more reliable for sub-admins and PMs to see shared data
        const snapshots = await Promise.all([
           db.collection('projects').where('clientId', '==', primaryUid).get(),
           db.collection('projects').where('userId', '==', uid).get() // Include personally owned if not standardized yet
        ]);

        const projectMap = new Map();
        snapshots.forEach(snap => {
           snap.docs.forEach(doc => { projectMap.set(doc.id, { id: doc.id, ...doc.data() }); });
        });

        const allProjects = Array.from(projectMap.values());

        // Build a profile map for display optimization
        const orgUsersSnap = await db.collection('users').where('clientId', '==', primaryUid).get();
        const pmMap: Record<string, any> = {};
        orgUsersSnap.docs.forEach(d => { pmMap[d.id] = d.data(); });
        if (primaryUid !== uid && !pmMap[primaryUid]) {
           const rootDoc = await db.collection('users').doc(primaryUid).get();
           if (rootDoc.exists) pmMap[primaryUid] = rootDoc.data();
        }

        // Add display info (Project Manager Name, etc.)
        allProjects.forEach(p => {
           const pmInfo = pmMap[p.userId] || {};
           p.pmName = pmInfo.displayName || pmInfo.companyName || pmInfo.email || (p.userId === primaryUid ? 'Client Admin' : 'Member');
           p.pmEmail = pmInfo.email || '';
        });

        // Check invitations for project assignments
        if (email) {
          const invitationsSnapshot = await db.collection('invitations').where('email', '==', email).get();
          const assignedProjectIds = invitationsSnapshot.docs.map(doc => doc.data().projectId).filter(Boolean);
          if (assignedProjectIds.length > 0) {
            const uniqueAssignedIds = [...new Set(assignedProjectIds)];
            for (const pid of uniqueAssignedIds) {
                if (!projectMap.has(pid)) {
                   const aDoc = await db.collection('projects').doc(pid).get();
                   if (aDoc.exists) allProjects.push({ id: aDoc.id, ...aDoc.data() });
                }
            }
          }
        }

        return res.status(200).json({ success: true, projects: allProjects });
      }

      if (action === 'updateProject') {
        const { id, data } = req.body;
        if (!id || !data) return res.status(400).json({ error: 'Missing id or data' });

        if (!(await isAuthorizedForContext(id))) {
          return res.status(403).json({ error: 'Forbidden: You do not have access to this project.' });
        }

        await db.collection('projects').doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });

        // Handle Project Manager Invitations
        if (data.pmEmails && typeof data.pmEmails === 'string') {
          const emails = data.pmEmails.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
          for (const pmEmail of emails) {
            await db.collection('invitations').add({
              email: pmEmail,
              invitedBy: uid,
              role: 'project_manager',
              projectId: id,
              updatedAt: FieldValue.serverTimestamp()
            });
          }
        }

        db.collection('activityLogs').add({ type: 'project_updated', uid, email, projectId: id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'deleteProject') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        if (!(await isAuthorizedForContext(id))) {
          return res.status(403).json({ error: 'Forbidden: You do not have access to this project.' });
        }

        await db.collection('projects').doc(id).delete();
        db.collection('activityLogs').add({ type: 'project_deleted', uid, email, projectId: id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'updateProgramme') {
        const { id, data } = req.body;
        if (!id || !data) return res.status(400).json({ error: 'Missing id or data' });

        if (!(await isAuthorizedForContext(id))) {
          return res.status(403).json({ error: 'Forbidden: You do not have access to this programme.' });
        }

        await db.collection('programmes').doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });
        db.collection('activityLogs').add({ type: 'programme_updated', uid, email, id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'deleteProgramme') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        if (!(await isAuthorizedForContext(id))) {
          return res.status(403).json({ error: 'Forbidden: You do not have access to delete this programme.' });
        }

        await db.collection('programmes').doc(id).delete();
        db.collection('activityLogs').add({ type: 'programme_deleted', uid, email, id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'adminDeleteProject') {
        const { id } = req.body;
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const isClientAdmin = userData.role === 'client_admin' || userData.role === 'enterprise' || userData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';

        if (!isClientAdmin) return res.status(403).json({ error: 'Forbidden: Client Admin role required.' });
        if (!id) return res.status(400).json({ error: 'Missing id' });

        const primaryUid = userData.clientId || uid;
        const projectDoc = await db.collection('projects').doc(id).get();
        if (!projectDoc.exists) return res.status(404).json({ error: 'Project not found' });
        
        if (projectDoc.data()?.clientId !== primaryUid && userData.role !== 'admin' && email !== 'jitbanerjeesujan@gmail.com') {
           return res.status(403).json({ error: 'Forbidden: Resource belongs to another organization.' });
        }

        await db.collection('projects').doc(id).delete();
        db.collection('activityLogs').add({ type: 'admin_project_deleted', uid, email, projectId: id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'adminDeleteProgramme') {
        const { id } = req.body;
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const isClientAdmin = userData.role === 'client_admin' || userData.role === 'enterprise' || userData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';

        if (!isClientAdmin) return res.status(403).json({ error: 'Forbidden: Client Admin role required.' });
        if (!id) return res.status(400).json({ error: 'Missing id' });

        const primaryUid = userData.clientId || uid;
        const progDoc = await db.collection('programmes').doc(id).get();
        if (!progDoc.exists) return res.status(404).json({ error: 'Programme not found' });
        
        if (progDoc.data()?.clientId !== primaryUid && userData.role !== 'admin' && email !== 'jitbanerjeesujan@gmail.com') {
           return res.status(403).json({ error: 'Forbidden: Resource belongs to another organization.' });
        }

        await db.collection('programmes').doc(id).delete();
        db.collection('activityLogs').add({ type: 'admin_programme_deleted', uid, email, id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'adminTransferProject') {
        const { id, targetUser } = req.body;
        if (!id || !targetUser?.uid) return res.status(400).json({ error: 'Missing project id or target user' });

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const isClientAdmin = userData.role === 'client_admin' || userData.role === 'enterprise' || userData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';

        if (!isClientAdmin) return res.status(403).json({ error: 'Forbidden: Client Admin role required.' });

        const primaryUid = userData.clientId || uid;
        const projectDoc = await db.collection('projects').doc(id).get();
        if (!projectDoc.exists) return res.status(404).json({ error: 'Project not found' });
        
        if (projectDoc.data()?.clientId !== primaryUid && userData.role !== 'admin' && email !== 'jitbanerjeesujan@gmail.com') {
           return res.status(403).json({ error: 'Forbidden: Resource belongs to another organization.' });
        }

        await db.collection('projects').doc(id).update({
          userId: targetUser.uid,
          pm: targetUser.email || projectDoc.data()?.pm,
          pmName: targetUser.displayName || targetUser.email || projectDoc.data()?.pmName,
          updatedAt: FieldValue.serverTimestamp()
        });

        db.collection('activityLogs').add({ 
            type: 'admin_project_transferred', 
            uid, email, 
            projectId: id, 
            targetUid: targetUser.uid,
            timestamp: new Date().toISOString() 
        }).catch(console.error);
        
        return res.status(200).json({ success: true });
      }

      if (action === 'adminTransferProgramme') {
        const { id, targetUser } = req.body;
        if (!id || !targetUser?.uid) return res.status(400).json({ error: 'Missing programme id or target user' });

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const isClientAdmin = userData.role === 'client_admin' || userData.role === 'enterprise' || userData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';

        if (!isClientAdmin) return res.status(403).json({ error: 'Forbidden: Client Admin role required.' });

        const primaryUid = userData.clientId || uid;
        const progDoc = await db.collection('programmes').doc(id).get();
        if (!progDoc.exists) return res.status(404).json({ error: 'Programme not found' });
        
        if (progDoc.data()?.clientId !== primaryUid && userData.role !== 'admin' && email !== 'jitbanerjeesujan@gmail.com') {
           return res.status(403).json({ error: 'Forbidden: Resource belongs to another organization.' });
        }

        await db.collection('programmes').doc(id).update({
          userId: targetUser.uid,
          pm: targetUser.email || progDoc.data()?.pm,
          updatedAt: FieldValue.serverTimestamp()
        });

        db.collection('activityLogs').add({ 
            type: 'admin_programme_transferred', 
            uid, email, 
            id, 
            targetUid: targetUser.uid,
            timestamp: new Date().toISOString() 
        }).catch(console.error);
        
        return res.status(200).json({ success: true });
      }

      if (action === 'inviteProjectManager') {
        const { pmEmail, pmName, pmRole } = req.body;
        if (!pmEmail) return res.status(400).json({ error: 'Missing pmEmail' });
        const normalizedEmail = pmEmail.trim().toLowerCase();
        await db.collection('invitations').add({
          email: normalizedEmail,
          name: pmName || '',
          invitedBy: uid,
          invitedByEmail: email,
          role: pmRole || 'project_manager',
          clientId: uid,
          createdAt: new Date().toISOString()
        });
        db.collection('activityLogs').add({ type: 'pm_invited', uid, email, pmEmail: normalizedEmail, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'clientGetPMs') {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const primaryUid = userData.clientId || uid;

        const pmsSnap = await db.collection('users').where('clientId', '==', primaryUid).where('role', '==', 'project_manager').get();
        const pms = pmsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

        // Also grab pending invitations
        const invSnap = await db.collection('invitations').where('clientId', '==', primaryUid).get();
        const pending = invSnap.docs.map(doc => ({ uid: null, id: doc.id, email: doc.data().email, name: doc.data().name || '', status: 'pending', ...doc.data() }));

        return res.status(200).json({ success: true, pms, pending });
      }

      // ── clientGetTeam: fetch ALL team members (all PM roles) for this client ──
      if (action === 'clientGetTeam') {
        const ALL_PM_ROLES = ['project_manager', 'senior_pm', 'senior_project_manager', 'assistant_pm', 'project_coordinator'];
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const primaryUid = userData.clientId || uid;

        const teamSnap = await db.collection('users').where('clientId', '==', primaryUid).get();
        const team = teamSnap.docs
          .map(doc => ({ uid: doc.id, ...doc.data() }))
          .filter((u: any) => ALL_PM_ROLES.includes(u.role));

        // Pending invitations for this client
        const invSnap = await db.collection('invitations').where('clientId', '==', primaryUid).get();
        const pending = invSnap.docs.map(doc => ({
          uid: null,
          id: doc.id,
          email: doc.data().email,
          name: doc.data().name || '',
          role: doc.data().role || 'project_manager',
          status: 'pending',
          createdAt: doc.data().createdAt || null,
        }));

        return res.status(200).json({ success: true, team, pending });
      }

      // ── clientRemoveUser: remove a PM from this client's team ──
      if (action === 'clientRemoveUser') {
        const { targetUid } = req.body;
        if (!targetUid) return res.status(400).json({ error: 'Missing targetUid' });

        const targetDoc = await db.collection('users').doc(targetUid).get();
        if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });
        const targetData = targetDoc.data() || {};

        // Safety: only remove users who belong to this client
        if (targetData.clientId !== uid) {
          return res.status(403).json({ error: 'Forbidden: This user does not belong to your organisation.' });
        }

        // Safety: never allow removing admin-level accounts
        const PROTECTED_ROLES = ['admin', 'client_admin'];
        if (PROTECTED_ROLES.includes(targetData.role || '')) {
          return res.status(403).json({ error: 'Forbidden: Cannot remove admin-level users.' });
        }

        await db.collection('users').doc(targetUid).update({ clientId: null });
        db.collection('activityLogs').add({ type: 'team_member_removed', uid, email, targetUid, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      // ── clientUpdateUserRole: change a team member's role (PM roles only) ──
      if (action === 'clientUpdateUserRole') {
        const { targetUid, role } = req.body;
        if (!targetUid || !role) return res.status(400).json({ error: 'Missing targetUid or role' });

        // Prevent privilege escalation — Client Admins CAN ONLY assign PM-level roles
        const ALLOWED_ROLES = ['project_manager', 'senior_pm', 'senior_project_manager', 'assistant_pm', 'project_coordinator'];
        if (!ALLOWED_ROLES.includes(role)) {
          return res.status(403).json({ error: 'Forbidden: You cannot assign this role.' });
        }

        const targetDoc = await db.collection('users').doc(targetUid).get();
        if (!targetDoc.exists) return res.status(404).json({ error: 'User not found' });

        // Only update users in your own organisation
        if (targetDoc.data()?.clientId !== uid) {
          return res.status(403).json({ error: 'Forbidden: This user does not belong to your organisation.' });
        }

        await db.collection('users').doc(targetUid).update({ role });
        db.collection('activityLogs').add({ type: 'team_member_role_updated', uid, email, targetUid, role, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'clientGetProjects') {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const primaryUid = userData.clientId || uid;

        const pmsSnap = await db.collection('users').where('clientId', '==', primaryUid).get();
        const pmMap: Record<string, any> = {};
        pmsSnap.docs.forEach(d => { pmMap[d.id] = d.data(); });
        
        // Ensure primary owner is in map
        if (!pmMap[primaryUid]) {
          const ownerDoc = await db.collection('users').doc(primaryUid).get();
          if (ownerDoc.exists) pmMap[primaryUid] = ownerDoc.data();
        }

        const pmUids = [primaryUid, ...pmsSnap.docs.map(d => d.id)];
        if (!pmUids.includes(uid)) pmUids.push(uid);

        const allProjects: any[] = [];
        const pmChunks = [];
        for (let i = 0; i < pmUids.length; i += 10) {
          pmChunks.push(pmUids.slice(i, i + 10));
        }
        const pmSnaps = await Promise.all(
          pmChunks.map(chunk => db.collection('projects').where('userId', 'in', chunk).get())
        );
        pmSnaps.forEach(snap => {
          snap.docs.forEach(doc => {
            const data = doc.data();
            const pmInfo = pmMap[data.userId] || {};
            allProjects.push({
              id: doc.id,
              ...data,
              pmName: pmInfo.displayName || pmInfo.companyName || pmInfo.email || (data.userId === primaryUid ? 'Client Admin' : 'Unknown PM'),
              pmEmail: pmInfo.email || ''
            });
          });
        });
        return res.status(200).json({ success: true, projects: allProjects });
      }



      if (action === 'clientGetProjectData') {
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const primaryUid = userData.clientId || uid;

        // Get all members belonging to this organization
        const pmsSnap = await db.collection('users').where('clientId', '==', primaryUid).get();
        const pmUids = [primaryUid, ...pmsSnap.docs.map(d => d.id)];
        if (!pmUids.includes(uid)) pmUids.push(uid);

        // Build a UID -> PM name map
        const pmMap: Record<string, any> = {};
        pmsSnap.docs.forEach(d => { pmMap[d.id] = d.data(); });
        if (!pmMap[primaryUid]) {
          const ownerDoc = await db.collection('users').doc(primaryUid).get();
          if (ownerDoc.exists) pmMap[primaryUid] = ownerDoc.data();
        }

        // Fetch all projects for all org members
        const allProjects: any[] = [];
        const pmChunksData = [];
        for (let i = 0; i < pmUids.length; i += 10) {
          pmChunksData.push(pmUids.slice(i, i + 10));
        }
        const pmSnapsData = await Promise.all(
          pmChunksData.map(chunk => db.collection('projects').where('userId', 'in', chunk).get())
        );
        pmSnapsData.forEach(snap => {
          snap.docs.forEach(doc => allProjects.push({ id: doc.id, ...doc.data() }));
        });

        // For each project, fetch compliance, risks, and issues data sub-docs in parallel
        const enrichedProjects = await Promise.all(allProjects.map(async (project) => {
          try {
            const [compDoc, riskDoc, issueDoc, activitySnap] = await Promise.all([
              db.collection('projects').doc(project.id).collection('data').doc('complianceItems').get(),
              db.collection('projects').doc(project.id).collection('data').doc('risks').get(),
              db.collection('projects').doc(project.id).collection('data').doc('issues').get(),
              db.collection('activityLogs').where('projectId', '==', project.id).orderBy('timestamp', 'desc').limit(1).get(),
            ]);

            const complianceItems: any[] = compDoc.exists ? (compDoc.data()?.data || []) : [];
            const risks: any[] = riskDoc.exists ? (riskDoc.data()?.data || []) : [];
            const issues: any[] = issueDoc.exists ? (issueDoc.data()?.data || []) : [];
            const lastActivity = activitySnap.docs[0]?.data()?.timestamp || null;

            const compTotal = complianceItems.length;
            const compComplete = complianceItems.filter((c: any) => c.stage === 'Complete').length;
            const compPct = compTotal > 0 ? Math.round((compComplete / compTotal) * 100) : 0;
            const compHighRisk = complianceItems.filter((c: any) => c.risk === 'High' && c.stage !== 'Complete').length;

            const riskOpen = risks.filter((r: any) => r.status === 'Open').length;
            const riskHigh = risks.filter((r: any) => (r.grossRating || 0) >= 16).length;
            const riskEscalated = risks.filter((r: any) => r.escalated).length;

            const issueOpen = issues.filter((i: any) => i.status !== '4. Resolved').length;
            const issueEscalated = issues.filter((i: any) => i.status === '2. Escalated').length;

            // RAG status
            let rag = 'Green';
            if (riskHigh > 0 || compHighRisk > 2) rag = 'Red';
            else if (riskOpen > 3 || compPct < 50) rag = 'Amber';

            const pmInfo = pmMap[project.userId] || {};

            return {
              ...project,
              pmName: pmInfo.displayName || pmInfo.companyName || pmInfo.email || (project.userId === primaryUid ? 'Client Admin' : 'Member'),
              pmEmail: pmInfo.email || '',
              lastActivity,
              compTotal, compComplete, compPct, compHighRisk,
              riskTotal: risks.length, riskOpen, riskHigh, riskEscalated,
              issueTotal: issues.length, issueOpen, issueEscalated,
              rag,
            };
          } catch (_) {
            return { ...project, pmName: 'Unknown', rag: 'Grey', compPct: 0, riskTotal: 0, issueTotal: 0, lastActivity: null };
          }
        }));

        return res.status(200).json({ success: true, projects: enrichedProjects });
      }



      if (action === 'saveData') {
        const { collection, data, projectId } = req.body;
        if (!collection || data === undefined) return res.status(400).json({ error: 'Missing collection or data' });

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const primaryUid = userData.clientId || uid;

        let pathRef;
        if (projectId) {
          if (!(await isAuthorizedForContext(projectId))) {
            return res.status(403).json({ error: 'Forbidden: You do not have access to this project.' });
          }
          pathRef = db.collection('projects').doc(projectId).collection('data').doc(collection);
        } else if (collection === 'programmes') {
          // Standardize: programmes stored as documents in top-level collection indexed by clientId
          if (Array.isArray(data)) {
             for (const programme of data) {
                const progId = programme.id || `PROG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
                await db.collection('programmes').doc(progId).set({
                   ...programme,
                   id: progId,
                   clientId: primaryUid,
                   userId: uid,
                   updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });
             }
             return res.status(200).json({ success: true });
          } else {
             // Single programme update
             const progId = data.id || `PROG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
             await db.collection('programmes').doc(progId).set({
                ...data,
                id: progId,
                clientId: primaryUid,
                userId: uid,
                updatedAt: FieldValue.serverTimestamp()
             }, { merge: true });
             return res.status(200).json({ success: true, id: progId });
          }
        } else if (['systemMappings', 'globalRisks'].includes(collection)) {
          // Standardize shared organization data to top-level collections
          pathRef = db.collection(collection).doc(primaryUid);
        } else {
          // Legacy subcollection storage for other personal data
          pathRef = db.collection('users').doc(uid).collection('data').doc(collection);
        }

        if (pathRef) {
          if (data === null) {
            await pathRef.delete();
          } else {
            await pathRef.set({ data });
          }
        }

        // Log meaningful save events (not every keystroke)
        if (['risks', 'issues', 'complianceItems', 'complianceAnalysis'].includes(collection)) {
          const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
          db.collection('activityLogs').add({ type: `${collection}_saved`, uid, email, projectId: projectId || 'legacy', count, timestamp: new Date().toISOString() }).catch(console.error);
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'getData') {
        const { collection, projectId } = req.body;
        if (!collection) return res.status(400).json({ error: 'Missing collection' });

        if (projectId) {
          if (!(await isAuthorizedForContext(projectId))) {
            return res.status(403).json({ error: 'Forbidden: You do not have access to this project.' });
          }
          const pathRef = db.collection('projects').doc(projectId).collection('data').doc(collection);
          const doc = await pathRef.get();
          return res.status(200).json({ success: true, data: doc.exists ? doc.data()?.data : null });
        } else if (collection === 'programmes') {
          const isAdmin = userData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';
          const isClientAdmin = userData.role === 'client_admin';

          if (isAdmin) {
            const allSnap = await db.collection('programmes').get();
            return res.status(200).json({ success: true, data: allSnap.docs.map(d => ({ id: d.id, ...d.data() })) });
          }

          // Fetch from top-level collection gated by clientId, userId, or pm
          const queries = [
            db.collection('programmes').where('clientId', '==', primaryUid).get(),
            db.collection('programmes').where('userId', '==', uid).get()
          ];
          if (email) {
            queries.push(db.collection('programmes').where('pm', '==', email).get());
          }
          
          const snaps = await Promise.all(queries);
          const programmesMap = new Map();
          
          snaps.forEach(snap => {
            snap.docs.forEach(doc => {
              programmesMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
          });
          
          const programmes = Array.from(programmesMap.values());
          return res.status(200).json({ success: true, data: programmes });
        } else if (collection === 'projects') {
          const isAdmin = userData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';
          
          if (isAdmin) {
             const allSnap = await db.collection('projects').get();
             return res.status(200).json({ success: true, data: allSnap.docs.map(d => ({ id: d.id, ...d.data() })) });
          }

          // FETCH ALL projects matching organization Root ID as primary check
          // This ensures newly created projects are visible to all org members
          const queries = [
             db.collection('projects').where('clientId', '==', primaryUid).get(),
             db.collection('projects').where('userId', '==', uid).get()
          ];
          if (email) {
             queries.push(db.collection('projects').where('pm', '==', email).get());
          }
          
          const snaps = await Promise.all(queries);
          const projectMap = new Map();
          
          snaps.forEach(snap => {
            snap.docs.forEach(doc => {
              projectMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
          });
          
          const projects = Array.from(projectMap.values());
          return res.status(200).json({ success: true, data: projects });
        } else {
          let doc;
          if (['systemMappings', 'globalRisks'].includes(collection)) {
            // Check top-level collection first
            doc = await db.collection(collection).doc(primaryUid).get();
            
            // Fallback to legacy path for backward compatibility during migration
            if (!doc.exists) {
              doc = await db.collection('users').doc(primaryUid).collection('data').doc(collection).get();
            }
          } else {
            doc = await db.collection('users').doc(uid).collection('data').doc(collection).get();
          }
          
          return res.status(200).json({ success: true, data: doc.exists ? doc.data()?.data : null });
        }
      }

      if (action === 'saveProfile') {
        const { profile } = req.body;
        if (!profile) return res.status(400).json({ error: 'Missing profile data' });
        
        // Whitelist allowed fields to prevent privilege escalation
        const allowedFields = ['displayName', 'photoURL', 'phoneNumber', 'bio', 'onboardingCompleted', 'theme', 'geminiBackupKey', 'fcmToken'];
        const sanitizedProfile: any = {};
        allowedFields.forEach(field => {
          if (profile[field] !== undefined) sanitizedProfile[field] = profile[field];
        });

        await db.collection('users').doc(uid).set(sanitizedProfile, { merge: true });
        return res.status(200).json({ success: true });
      }

      if (action === 'getProfile') {
        let profileData: any = userData;

        // Ensure the admin user is correctly tagged if they aren't already
        if (isAdmin && profileData.role !== 'admin') {
           await db.collection('users').doc(uid).set({
              email,
              role: 'admin',
              updatedAt: new Date().toISOString()
            }, { merge: true });
            profileData = { ...profileData, email, role: 'admin' };
        } else if (!profileData.role) {
          // Check for invitations first if role is missing entirely
          const invSnap = await db.collection('invitations')
            .where('email', '==', email)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

          if (!invSnap.empty) {
            const invData = invSnap.docs[0].data();
            const requestedRole = invData?.role || 'project_manager';

            await db.collection('users').doc(uid).set({
              email,
              role: requestedRole,
              clientId: invData?.clientId || invData?.invitedBy,
              updatedAt: new Date().toISOString()
            }, { merge: true });

            profileData = {
              ...profileData,
              email,
              role: requestedRole,
              clientId: invData?.clientId || invData?.invitedBy
            };

            // If it was a workspace-level invitation (no projectId), delete it
            if (!invData?.projectId) {
              await db.collection('invitations').doc(invSnap.docs[0].id).delete();
            }
          } else {
            // No invitation and no role: assign default Project Manager role
            await db.collection('users').doc(uid).set({
              email,
              role: 'project_manager',
              updatedAt: new Date().toISOString()
            }, { merge: true });

            profileData = {
              ...profileData,
              email,
              role: 'project_manager'
            };
          }
        }

        return res.status(200).json({ success: true, profile: profileData });
      }

      if (action === 'geminiPrompt' || action === 'analyzeCompliance' || action === 'analyzeRisks' || action === 'analyzeControls' || action === 'chatWithAI') {
        const { prompt, config } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Missing prompt text' });

        // Use the latest Gemini flash model alias as strictly requested
        const PRIMARY_MODEL = 'gemini-flash-latest';
        const BACKUP_MODEL = 'gemini-flash-latest';
        const SYSTEM_FALLBACK_KEY = 'AIzaSyDPMd11eCAxyfeK5nBrJWv7zv9cj4OmLOg';

        const generationConfig = {
          temperature: config?.temperature || 0.7,
          topP: config?.topP || 0.95,
          topK: config?.topK || 40,
          maxOutputTokens: config?.maxOutputTokens || 2048,
          responseMimeType: config?.responseMimeType || 'text/plain'
        };

        try {
          // Use correct SDK method: ai.models.generateContent
          const result = await ai.models.generateContent({
            model: PRIMARY_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: generationConfig
          });
          
          let resultValue = result.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!resultValue) {
            console.warn("Gemini returned empty text or no candidates.");
          }

          if (config?.responseMimeType === 'application/json' || action === 'analyzeCompliance' || action === 'analyzeRisks' || action === 'analyzeControls') {
            resultValue = parseAIResponse(resultValue || '', action === 'analyzeCompliance' ? {} : []);
          }

          return res.status(200).json({ success: true, result: resultValue });
        } catch (initialError: any) {
          console.error("Primary Gemini API failed:", initialError);
          const userBackupKey = userData?.geminiBackupKey;

          // Try user backup key first, if none, use system fallback key
          const effectivelyUsedKey = userBackupKey || SYSTEM_FALLBACK_KEY;

          try {
            const backupAi = new GoogleGenAI({ apiKey: effectivelyUsedKey });
            const backupResult = await backupAi.models.generateContent({
              model: BACKUP_MODEL,
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              config: generationConfig
            });

            let backupResultValue = backupResult.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (config?.responseMimeType === 'application/json' || action === 'analyzeCompliance' || action === 'analyzeRisks' || action === 'analyzeControls' || action === 'chatWithAI') {
              backupResultValue = parseAIResponse(backupResultValue || '', (action === 'analyzeCompliance' || action === 'chatWithAI') ? {} : []);
            }
            return res.status(200).json({ success: true, result: backupResultValue });
          } catch (backupError: any) {
            console.error("Backup Gemini API failed:", backupError);
            
            const isQuotaError = backupError?.status === 429 || backupError?.message?.includes('quota') || backupError?.message?.includes('429');
            const retryAdvice = isQuotaError ? "Please wait at least 60 seconds before retrying." : "Please try again in a few moments.";
            
            const errorMsg = userBackupKey
              ? (isQuotaError 
                  ? `Your personal Gemini API quota exceeded. ${retryAdvice} Check your billing at Google AI Studio.` 
                  : `AI engine overloaded and your backup key failed. ${retryAdvice}`)
              : (isQuotaError 
                  ? `System AI quota exceeded. ${retryAdvice} You can provide your own Gemini API key in Profile Settings for higher limits.` 
                  : `AI engine is currently overloaded. ${retryAdvice} Providing a personal Gemini API key in Profile Settings usually resolves this.`);
            
            return res.status(isQuotaError ? 429 : 500).json({ 
              error: errorMsg,
              details: backupError?.message || String(backupError),
              retryAfter: isQuotaError ? 60 : null
            });
          }
        }
      }

      if (action === 'getEvidence') {
        const { projectId } = req.body;
        const isAggregate = !projectId || projectId === 'all' || projectId === 'portfolio';

        if (isAggregate) {
          // Discovery of all authorized projects/programmes for the user
          if (isAdmin) {
             const snap = await db.collection('evidence').orderBy('createdAt', 'desc').limit(150).get();
             return res.status(200).json({ success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
          }

          const primaryUid = userData.clientId || uid;
          const projSnap = await db.collection('projects').where('clientId', '==', primaryUid).get();
          const ownedProjSnap = await db.collection('projects').where('userId', '==', uid).get();
          const progSnap = await db.collection('programmes').where('clientId', '==', primaryUid).get();
          
          let authorizedIds = Array.from(new Set([
            ...projSnap.docs.map(d => d.id), 
            ...ownedProjSnap.docs.map(d => d.id),
            ...progSnap.docs.map(d => d.id)
          ]));

          if (authorizedIds.length === 0) return res.status(200).json({ success: true, data: [] });

          let allEvidence: any[] = [];
          // Chunked query to stay within Firestore 'in' limit (30)
          for (let i = 0; i < authorizedIds.length; i += 30) {
             const chunk = authorizedIds.slice(i, i + 30);
             const snap = await db.collection('evidence').where('project', 'in', chunk).limit(300).get();
             allEvidence = [...allEvidence, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
          }
          
          return res.status(200).json({ success: true, data: allEvidence });
        }

        const isAuthorized = await isAuthorizedForContext(projectId);
        if (!isAuthorized) {
          console.error(`Auth failed for user ${uid} on context ${projectId}`);
          return res.status(403).json({ error: 'Forbidden: You do not have access to this project or programme.' });
        }

        // Check if the context is a programme to aggregate project evidence
        let targetContextIds = [projectId];
        const progDoc = await db.collection('programmes').doc(projectId).get();
        if (progDoc.exists) {
          const projectsSnap = await db.collection('projects').where('programmeId', '==', projectId).get();
          const pids = projectsSnap.docs.map(d => d.id);
          if (pids.length > 0) {
            targetContextIds = [...targetContextIds, ...pids];
          }
        }

        // Fetch evidence for the context(s)
        // Note: Firestore 'in' query supports up to 30 items.
        let data: any[] = [];
        if (targetContextIds.length > 30) {
           // Fallback for very large programmes: multiple chunks or just the programme-level docs
           const snap = await db.collection('evidence').where('project', '==', projectId).get();
           data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
           const snap = await db.collection('evidence').where('project', 'in', targetContextIds).get();
           data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        return res.status(200).json({ success: true, data });
      }

      if (action === 'addEvidence') {
        const { projectId, document } = req.body;
        if (!projectId || !document) return res.status(400).json({ error: 'Missing data' });
        
        const isAuthorized = await isAuthorizedForContext(projectId);
        if (!isAuthorized) {
          return res.status(403).json({ error: 'Forbidden: You do not have access to upload evidence here.' });
        }

        const docRef = await db.collection('evidence').add({ 
          ...document, 
          project: projectId, 
          userId: uid,
          uploadedBy: email,
          createdAt: FieldValue.serverTimestamp() 
        });
        return res.status(200).json({ success: true, id: docRef.id });
      }

      if (action === 'deleteEvidence') {
        const { docId } = req.body;
        if (!docId) return res.status(400).json({ error: 'Missing docId' });
        const evidenceDoc = await db.collection('evidence').doc(docId).get();
        if (!evidenceDoc.exists) return res.status(200).json({ success: true }); // Already gone
        const evidenceData = evidenceDoc.data();
        if (!(await isAuthorizedForContext(evidenceData?.project))) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        await db.collection('evidence').doc(docId).delete();
        return res.status(200).json({ success: true });
      }

      if (action === 'sendNotification') {
        const { fcmToken, title, body } = req.body;
        if (!fcmToken) return res.status(400).json({ error: 'Missing fcmToken' });
        
        // Only admins and client_admins can send manual/proxy notifications
        if (userData.role !== 'admin' && userData.role !== 'client_admin') {
           return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }

        const response = await getMessagingService().send({
          token: fcmToken,
          notification: { title: title || 'New Alert', body: body || 'You have a new message' }
        });
        return res.status(200).json({ success: true, messageId: response });
      }

      if (action === 'getComplianceLibrary') {
        const snap = await db.collection('compliance_library').get();
        const library = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, library });
      }

      if (action === 'upsertComplianceLibraryItem') {
        const { item } = req.body;
        if (!item || !item.id) return res.status(400).json({ error: 'Missing item or id' });

        if (!isAdmin) return res.status(403).json({ error: 'Forbidden: Admin access required' });

        await db.collection('compliance_library').doc(item.id).set({
          ...item,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: email
        }, { merge: true });

        db.collection('activityLogs').add({ type: 'compliance_library_updated', uid, email, itemId: item.id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'deleteComplianceLibraryItem') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        if (!isAdmin) return res.status(403).json({ error: 'Forbidden: Admin access required' });

        await db.collection('compliance_library').doc(id).delete();
        db.collection('activityLogs').add({ type: 'compliance_library_deleted', uid, email, itemId: id, timestamp: new Date().toISOString() }).catch(console.error);
        return res.status(200).json({ success: true });
      }

      if (action === 'getComplianceDomains') {
        const snap = await db.collection('compliance_domains').orderBy('label', 'asc').get();
        const domains = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, domains });
      }

      if (action === 'upsertComplianceDomain') {
        const { domain } = req.body;
        if (!domain || !domain.id) return res.status(400).json({ error: 'Missing domain or id' });

        const userDoc = await db.collection('users').doc(uid).get();
        const isAdmin = userDoc.data()?.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden: Admin access required' });

        await db.collection('compliance_domains').doc(domain.id).set({
          ...domain,
          updatedAt: FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true });
      }

      if (action === 'adminStats') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const userDoc = await db.collection('users').doc(uid).get();
        const isAdmin = userDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const usersSnap = await db.collection('users').count().get();
        const projectsSnap = await db.collection('projects').count().get();
        const activitySnap = await db.collection('activityLogs').count().get();
        return res.status(200).json({
          success: true,
          stats: {
            users: usersSnap.data().count,
            properties: projectsSnap.data().count,
            activities: activitySnap.data().count
          }
        });
      }

      if (action === 'adminGetUsers') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        // Fetch users from Firebase Auth directly to ensure NO users are missing
        const authService = getAuthService();
        let authUsers: any[] = [];
        try {
          const listUsersResult = await authService.listUsers(1000);
          authUsers = listUsersResult.users;
        } catch (authErr) {
          console.error("Auth listUsers error:", authErr);
        }

        // Also get the users collection for roles
        const usersSnap = await db.collection('users').limit(1000).get();
        const firestoreUsers = new Map(usersSnap.docs.map(doc => [doc.id, doc.data()]));

        const combinedUsers = authUsers.length > 0 ? authUsers.map(authRecord => {
          const fsUser = firestoreUsers.get(authRecord.uid) || {};
          return {
            uid: authRecord.uid,
            displayName: fsUser.companyName || fsUser.displayName || fsUser.orgName || authRecord.displayName || '',
            role: fsUser.role || 'user',
            subscriptionRequest: fsUser.subscriptionRequest || null,
            createdAt: fsUser.createdAt || (authRecord.metadata && authRecord.metadata.creationTime) || new Date().toISOString(),
            ...fsUser,
            email: authRecord.email || fsUser.email || '' // Priority to Auth email
          };
        }) : usersSnap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            email: data.email || '',
            displayName: data.companyName || data.displayName || data.orgName || '',
            role: data.role || 'user',
            subscriptionRequest: data.subscriptionRequest || null,
            createdAt: data.createdAt || new Date().toISOString(),
            ...data
          };
        });

        return res.status(200).json({ success: true, users: combinedUsers });
      }

      if (action === 'getAssignablePMs') {
        const callerDoc = await db.collection('users').doc(uid).get();
        const callerData = callerDoc.data() || {};
        const isAdmin = callerData.role === 'admin' || email === 'jitbanerjeesujan@gmail.com';
        const isClientAdmin = callerData.role === 'client_admin' || callerData.role === 'enterprise';

        if (!isAdmin && !isClientAdmin) return res.status(403).json({ error: 'Forbidden' });

        // Include all roles that can manage projects
        const pmRoles = [
          'project_manager', 'senior_pm', 'senior_project_manager',
          'assistant_pm', 'assistant_project_manager',
          'project_coordinator', 'pro', 'enterprise', 'client_admin'
        ];

        let query = db.collection('users').where('role', 'in', pmRoles);

        // If client admin, only show PMs from their company, BUT also include themselves
        if (isClientAdmin && !isAdmin) {
          query = query.where('clientId', '==', uid);
        }

        const snap = await query.get();
        const users = snap.docs.map(doc => ({
          uid: doc.id,
          email: doc.data().email,
          role: doc.data().role,
          displayName: doc.data().displayName || doc.data().companyName || doc.data().email
        }));

        // If client admin, make sure they are in the list so they can assign to themselves
        if (isClientAdmin && !users.find(u => u.uid === uid)) {
          users.push({
            uid,
            email,
            role: callerData.role,
            displayName: callerData.displayName || callerData.companyName || email
          });
        }

        return res.status(200).json({ success: true, users });
      }

      if (action === 'adminGetProjects') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const snap = await db.collection('projects').get();
        const projects = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // To make the projects useful, we should ideally resolve client and PM names
        // But for brevity and performance in this first pass, we'll return the raw list.
        // The admin panel can do the mapping if it has the users list.

        return res.status(200).json({ success: true, projects });
      }

      if (action === 'adminGetProgrammes') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const snap = await db.collection('programmes').get();
        const programmes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, programmes });
      }

      if (action === 'adminUpdateUser') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { targetUid, updates } = req.body;
        if (!targetUid || !updates) return res.status(400).json({ error: 'Missing targetUid or updates' });

        await db.collection('users').doc(targetUid).set({
          ...updates,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Log this admin action
        await db.collection('activityLogs').add({
          type: 'admin_user_update',
          adminUid: uid,
          adminEmail: email,
          targetUid,
          updates,
          timestamp: new Date().toISOString()
        });

        return res.status(200).json({ success: true });
      }

      if (action === 'adminGetActivity') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const snap = await db.collection('activityLogs').orderBy('timestamp', 'desc').limit(50).get();
        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, logs });
      }

      if (action === 'adminGetMappings') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const snap = await db.collection('systemMappings').get();
        const mappings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, mappings });
      }

      if (action === 'adminDeleteProgramme') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing programme id' });

        await db.collection('programmes').doc(id).delete();
        
        // Log activity
        await db.collection('activityLogs').add({
          type: 'admin_delete_programme',
          adminUid: uid, adminEmail: email,
          id, timestamp: new Date().toISOString()
        });

        return res.status(200).json({ success: true });
      }

      if (action === 'adminDeleteProject') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing project id' });

        // Recursive delete of data subcollection could be added here, but for now we'll delete the main doc
        await db.collection('projects').doc(id).delete();
        
        // Log activity
        await db.collection('activityLogs').add({
          type: 'admin_delete_project',
          adminUid: uid, adminEmail: email,
          id, timestamp: new Date().toISOString()
        });

        return res.status(200).json({ success: true });
      }

      if (action === 'adminTransferProgramme') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { id, targetUser } = req.body;
        if (!id || !targetUser) return res.status(400).json({ error: 'Missing id or targetUser' });

        await db.collection('programmes').doc(id).update({
          userId: targetUser.uid,
          pm: targetUser.email,
          clientId: targetUser.clientId || targetUser.uid,
          updatedAt: FieldValue.serverTimestamp()
        });

        // Log activity
        await db.collection('activityLogs').add({
          type: 'admin_transfer_programme',
          adminUid: uid, adminEmail: email,
          id, targetUid: targetUser.uid,
          targetEmail: targetUser.email,
          timestamp: new Date().toISOString()
        });

        return res.status(200).json({ success: true });
      }

      if (action === 'adminTransferProject') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { id, targetUser } = req.body;
        if (!id || !targetUser) return res.status(400).json({ error: 'Missing id or targetUser' });

        await db.collection('projects').doc(id).update({
          userId: targetUser.uid,
          pm: targetUser.email,
          clientId: targetUser.clientId || targetUser.uid,
          updatedAt: FieldValue.serverTimestamp()
        });

        // Log activity
        await db.collection('activityLogs').add({
          type: 'admin_transfer_project',
          adminUid: uid, adminEmail: email,
          id, targetUid: targetUser.uid,
          targetEmail: targetUser.email,
          timestamp: new Date().toISOString()
        });

        return res.status(200).json({ success: true });
      }

      // Any authenticated user can read system mappings (used by AI features)
      if (action === 'getSystemMappings') {
        const doc = await db.collection('systemMappings').doc(primaryUid).get();
        if (doc.exists) {
          const mappings = doc.data()?.data || [];
          return res.status(200).json({ success: true, mappings });
        }
        
        // Legacy fallback to global collection
        const snap = await db.collection('systemMappings').get();
        const mappings = snap.docs.filter(d => d.id !== primaryUid).map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, mappings });
      }


      if (action === 'adminSaveMapping') {
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { mapping } = req.body;
        if (!mapping) return res.status(400).json({ error: 'Missing mapping' });

        // Standardize to the organizations' mapping document instead of global collection
        const docRef = db.collection('systemMappings').doc(primaryUid);
        const doc = await docRef.get();
        let mappings = doc.exists ? (doc.data()?.data || []) : [];

        if (mapping.id) {
          mappings = mappings.map((m: any) => m.id === mapping.id ? { ...mapping, updatedAt: new Date().toISOString() } : m);
        } else {
          const newMapping = {
            ...mapping,
            id: `MAP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          mappings.push(newMapping);
        }
        
        await docRef.set({ data: mappings }, { merge: true });
        return res.status(200).json({ success: true });
      }

      if (action === 'adminDeleteMapping') {
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        const docRef = db.collection('systemMappings').doc(primaryUid);
        const doc = await docRef.get();
        if (doc.exists) {
          const mappings = (doc.data()?.data || []).filter((m: any) => m.id !== id);
          await docRef.set({ data: mappings }, { merge: true });
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'deleteUserAccount') {
        const { targetUid } = req.body;
        
        let uidToDelete = uid;
        if (targetUid && targetUid !== uid) {
          const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
          const callerDoc = await db.collection('users').doc(uid).get();
          const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
          if (!isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Only super admins can delete other users' });
          }
          uidToDelete = targetUid;
        }

        // 1. Delete all projects where userId == uidToDelete (they are the explicit owner)
        // Note: Projects created by this user but owned by a Client Admin (userId = Client Admin) are kept.
        const projectsSnap = await db.collection('projects').where('userId', '==', uidToDelete).get();
        for (const pDoc of projectsSnap.docs) {
           const pid = pDoc.id;
           const evidenceSnap = await db.collection('evidence').where('project', '==', pid).get();
           for (const eDoc of evidenceSnap.docs) {
               await eDoc.ref.delete();
           }
           await pDoc.ref.delete();
        }

        // 2. Delete nested data maps in the users collection
        const collectionsToClear = ['programmes', 'systemMappings', 'globalRisks', 'preferences'];
        for (const coll of collectionsToClear) {
           await db.collection('users').doc(uidToDelete).collection('data').doc(coll).delete();
        }

        // 3. Delete the main user document
        await db.collection('users').doc(uidToDelete).delete();

        // 4. Delete Firebase Auth User Record
        try {
           await getAuthService().deleteUser(uidToDelete);
        } catch (authErr) {
           console.error('Failed to delete user from Firebase Auth. It might already be removed.', authErr);
        }

        // 5. Log deletion
        db.collection('activityLogs').add({
           type: 'account_deleted',
           uid, email, 
           targetUid: uidToDelete,
           timestamp: new Date().toISOString()
        }).catch(console.error);

        return res.status(200).json({ success: true, message: 'User account completely erased.' });
      }

      if (action === 'adminGetPricingConfig') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const doc = await db.collection('platform').doc('pricingConfig').get();
        return res.status(200).json({ success: true, data: doc.exists ? doc.data() : null });
      }

      if (action === 'adminUpdatePricingConfig') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { config } = req.body;
        if (!config || typeof config !== 'object') return res.status(400).json({ error: 'Missing or invalid config' });

        await db.collection('platform').doc('pricingConfig').set({
          ...config,
          updatedAt: new Date().toISOString(),
          updatedBy: email
        });

        db.collection('activityLogs').add({
          type: 'pricing_config_updated',
          uid, email,
          timestamp: new Date().toISOString()
        }).catch(console.error);

        return res.status(200).json({ success: true });
      }

      if (action === 'adminCreateInvoice') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { invoice } = req.body;
        if (!invoice) return res.status(400).json({ error: 'Missing invoice data' });

        const docRef = await db.collection('invoices').add({
          ...invoice,
          createdBy: uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        return res.status(200).json({ success: true, id: docRef.id });
      }

      if (action === 'adminGetInvoices') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const snap = await db.collection('invoices').orderBy('createdAt', 'desc').get();
        const invoices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, invoices });
      }

      if (action === 'adminDeleteInvoice') {
        const ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';
        const callerDoc = await db.collection('users').doc(uid).get();
        const isAdmin = callerDoc.data()?.role === 'admin' || email === ADMIN_EMAIL;
        if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing invoice id' });

        await db.collection('invoices').doc(id).delete();

        db.collection('activityLogs').add({
          type: 'invoice_deleted',
          uid, email,
          invoiceId: id,
          timestamp: new Date().toISOString()
        }).catch(console.error);

        return res.status(200).json({ success: true });
      }

      if (action === 'clientGetInvoices') {
        const callerDoc = await db.collection('users').doc(uid).get();
        const callerData = callerDoc.data() || {};
        const isClientAdmin = callerData.role === 'client_admin' || callerData.role === 'enterprise';

        if (!isClientAdmin && callerData.role !== 'admin' && email !== 'jitbanerjeesujan@gmail.com') {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const snap = await db.collection('invoices')
          .where('clientId', '==', uid)
          .orderBy('createdAt', 'desc')
          .get();

        const invoices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, invoices });
      }

      // --- USER PREFERENCES & PROFILE ---
      if (action === 'savePreference') {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Missing key' });

        await db.collection('users').doc(uid).collection('data').doc('preferences').set({
          [key]: value,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({ success: true });
      }

      if (action === 'getPreferences') {
        const doc = await db.collection('users').doc(uid).collection('data').doc('preferences').get();
        return res.status(200).json({ success: true, preferences: doc.exists ? doc.data() : {} });
      }

      if (action === 'saveProfile') {
        const { profile } = req.body;
        if (!profile) return res.status(400).json({ error: 'Missing profile data' });

        await db.collection('users').doc(uid).set({
          ...profile,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({ success: true });
      }

      if (action === 'getProfile') {
        const doc = await db.collection('users').doc(uid).get();
        return res.status(200).json({ success: true, profile: doc.exists ? doc.data() : null });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
