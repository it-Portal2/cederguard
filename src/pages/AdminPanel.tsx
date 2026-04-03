import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
    Users,
    Building2,
    Search,
    Filter,
    ChevronDown,
    AlertCircle,
    ExternalLink,
    Loader2,
    FolderKanban,
    ShieldCheck,
    Target,
    CheckCircle,
    Save,
    Trash2,
    RefreshCcw,
    RefreshCw,
    X,
    LayoutDashboard,
    CreditCard,
    FileText,
    Database,
    Zap,
    Briefcase,
    User,
    Shield,
    BarChart,
    Brain,
    History,
    Settings,
    Download,
    LineChart,
    Server,
    Layers,
    DollarSign,
    Activity,
    Edit2,
    Building2 as Building
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import { clsx } from 'clsx';
import { RIBA_STAGES } from '../constants/ribaStages';
import { MappingManager } from '../components/admin/MappingManager';
import { isSuperAdmin, isSystemAdmin, isClientAdmin } from '../lib/roles';
import { RegulationManager } from '../components/admin/RegulationManager';
import { DEFAULT_PRICING, calculatePlatformCosts } from './InvoiceManager';
import { generateId } from '../lib/utils';



const ROLE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    admin: { label: 'Admin', color: 'bg-purple-100 text-purple-800', icon: Shield },
    client_admin: { label: 'Client Admin', color: 'bg-indigo-100 text-indigo-800', icon: Building2 },
    project_manager: { label: 'Project Manager', color: 'bg-teal-100 text-teal-800', icon: Briefcase },
    senior_project_manager: { label: 'Senior Project Manager', color: 'bg-emerald-100 text-emerald-800', icon: Shield },
    assistant_project_manager: { label: 'Assistant Project Manager', color: 'bg-slate-100 text-slate-800', icon: Briefcase },
    project_coordinator: { label: 'Project Coordinator', color: 'bg-blue-50 text-blue-700', icon: User },
};

const PLAN_OPTIONS = ['project_manager', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator', 'client_admin', 'admin'];

const ACTIVITY_ICONS: Record<string, { label: string; color: string }> = {
    admin_user_update: { label: 'User Updated', color: 'text-purple-600 bg-purple-50' },
    project_created: { label: 'Project Created', color: 'text-emerald-600 bg-emerald-50' },
    project_updated: { label: 'Project Updated', color: 'text-blue-600 bg-blue-50' },
    project_deleted: { label: 'Project Deleted', color: 'text-red-600 bg-red-50' },
    risk_assessed: { label: 'Risk Assessed', color: 'text-orange-600 bg-orange-50' },
    compliance_checked: { label: 'Compliance Checked', color: 'text-teal-600 bg-teal-50' },
    programme_created: { label: 'Programme Created', color: 'text-emerald-600 bg-emerald-50' },
    programme_deleted: { label: 'Programme Deleted', color: 'text-red-600 bg-red-50' },
    admin_transfer_project: { label: 'Project Transferred', color: 'text-amber-600 bg-amber-50' },
    admin_transfer_programme: { label: 'Programme Transferred', color: 'text-purple-600 bg-purple-50' },
    default: { label: 'Activity', color: 'text-slate-600 bg-slate-100' },
};

function RoleBadge({ role }: { role: string }) {
    const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.project_manager;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
            <Icon className="w-3 h-3" /> {cfg.label}
        </span>
    );
}

function StatCard({ icon: Icon, label, value, color, border, onClick }: { icon: any; label: string; value: number | string; color: string; border: string; onClick?: () => void }) {
    return (
        <div 
            onClick={onClick}
            className={clsx(
                "bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-start gap-4 transition-all border-l-4", 
                border,
                onClick ? "cursor-pointer hover:shadow-md" : ""
            )}
        >
            <div className={`p-3 rounded-xl ${color}`}><Icon className="w-5 h-5" /></div>
            <div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">{label}</p>
                <p className="text-3xl font-black text-slate-900">{value}</p>
            </div>
        </div>
    );
}

// ─── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ isAdmin }: { isAdmin: boolean }) {
    const { user } = useStore();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [updating, setUpdating] = useState<string | null>(null);
    const [deletingUser, setDeletingUser] = useState<string | null>(null);
    const [userToDelete, setUserToDelete] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.adminGetUsers();
            if (res.success) setUsers(res.users || []);
            else setError(res.error || 'Failed to load users');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

    const handleRoleChange = async (targetUid: string, role: string) => {
        setUpdating(targetUid);
        try {
            await api.adminUpdateUser(targetUid, { role });
            setUsers(prev => prev.map(u => u.uid === targetUid ? { ...u, role } : u));
        } catch (e: any) {
            setError('Update failed: ' + e.message);
        } finally {
            setUpdating(null);
        }
    };

    const handleClientChange = async (targetUid: string, clientId: string) => {
        setUpdating(targetUid);
        try {
            await api.adminUpdateUser(targetUid, { clientId });
            setUsers(prev => prev.map(u => u.uid === targetUid ? { ...u, clientId } : u));
        } catch (e: any) {
            setError('Update failed: ' + e.message);
        } finally {
            setUpdating(null);
        }
    };

    const handleDeleteUser = async (targetUid: string) => {
        setDeletingUser(targetUid);
        setError(null);
        try {
            await api.deleteUserAccount(targetUid);
            setUsers(prev => prev.filter(u => u.uid !== targetUid));
            setUserToDelete(null);
        } catch (e: any) {
            setError('Delete failed: ' + e.message);
        } finally {
            setDeletingUser(null);
        }
    };

    const clientAdmins = users.filter(u => ['pro', 'enterprise', 'client_admin'].includes(u.role));

    const filtered = (Array.isArray(users) ? users : []).filter(u =>
        (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.displayName || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
    if (error) return <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by email or name…"
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <button onClick={load} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                </button>
                <span className="text-sm text-slate-500">{filtered.length} users</span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">User</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Joined</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Access Level</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Assigned Client</th>
                            <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-12 text-slate-400">No users found.</td></tr>
                        ) : filtered.map(u => (
                            <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3">
                                    <p className="font-medium text-slate-800">{u.displayName || u.email || 'Admin User'}</p>
                                    <p className="text-xs text-slate-400">{u.email}</p>
                                </td>
                                <td className="px-4 py-3"><RoleBadge role={u.role || 'user'} /></td>
                                <td className="px-4 py-3 text-slate-500 text-xs">
                                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                                </td>
                                <td className="px-4 py-3">
                                    {updating === u.uid ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="relative inline-block">
                                                <select
                                                    value={u.role || 'user'}
                                                    onChange={e => handleRoleChange(u.uid, e.target.value)}
                                                    className="appearance-none pl-3 pr-8 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                                    disabled={
                                                        u.email === user?.email || // Cannot demote self
                                                        isSystemAdmin(u.email) // Cannot demote core system admins
                                                    }
                                                >
                                                    {PLAN_OPTIONS.map(p => (
                                                        <option key={p} value={p}>{ROLE_CONFIG[p]?.label || p}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                            </div>
                                        </div>
                                    )}
                                </td>
                                {(['project_manager', 'senior_pm', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator', 'user', 'pro', 'enterprise', 'employee'].includes(u.role || 'user')) && (
                                    <td className="px-4 py-3">
                                        <div className="relative inline-block w-full max-w-[200px]">
                                            <select
                                                value={u.clientId || ''}
                                                onChange={e => handleClientChange(u.uid, e.target.value)}
                                                className="appearance-none w-full pl-3 pr-8 py-1.5 border border-slate-200 rounded-lg text-xs bg-indigo-50 text-indigo-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer truncate"
                                            >
                                                <option value="" className="text-slate-500 font-normal">Assign Client...</option>
                                                {clientAdmins.map(ca => (
                                                    <option key={ca.uid} value={ca.uid} className="text-slate-900 font-normal">
                                                        {ca.companyName || ca.displayName || ca.email}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" />
                                        </div>
                                    </td>
                                )}
                                {!(['project_manager', 'senior_pm', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator', 'user', 'pro', 'enterprise', 'employee'].includes(u.role || 'user')) && (
                                    <td className="px-4 py-3 text-slate-400 text-xs">—</td>
                                )}
                                <td className="px-4 py-3 text-right">
                                    {userToDelete === u.uid ? (
                                        <div className="flex items-center justify-end gap-2 p-2 bg-red-50 rounded-lg border border-red-100 animate-in fade-in slide-in-from-right-2">
                                            <p className="text-[10px] text-red-600 font-bold uppercase mr-2 text-wrap max-w-[100px] text-left leading-tight">Erase all data permanently?</p>
                                            <button
                                                onClick={() => handleDeleteUser(u.uid)}
                                                disabled={deletingUser === u.uid}
                                                className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded shadow-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 transition-all shrink-0"
                                            >
                                                {deletingUser === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                Confirm
                                            </button>
                                            <button
                                                onClick={() => setUserToDelete(null)}
                                                disabled={deletingUser === u.uid}
                                                className="px-3 py-1 bg-white text-slate-600 border border-slate-200 text-xs font-bold rounded hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm shrink-0"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setUserToDelete(u.uid)}
                                            disabled={u.email === user?.email || isSystemAdmin(u.email)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                            title="Delete User"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Activity Tab ───────────────────────────────────────────────────────────────
function ActivityTab({ isAdmin, users }: { isAdmin: boolean; users: any[] }) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState('all');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.adminGetActivity();
            if (res.success) setLogs(res.logs || []);
            else setError(res.error || 'Failed to load activity');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

    const types = ['all', ...Array.from(new Set((Array.isArray(logs) ? logs : []).map(l => l.type)))];
    const filtered = filterType === 'all' ? (Array.isArray(logs) ? logs : []) : (Array.isArray(logs) ? logs : []).filter(l => l.type === filterType);

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
    if (error) return <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    {(Array.isArray(types) ? types : []).map(t => (
                        <option key={t as string} value={t as string}>
                            {t === 'all' ? 'All Types' : (ACTIVITY_ICONS[t as string]?.label || t as string)}
                        </option>
                    ))}
                </select>
                <button onClick={load} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                </button>
                <span className="text-sm text-slate-500">{filtered.length} events</span>
            </div>

            {filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                    <LineChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No activity recorded yet</p>
                    <p className="text-xs text-slate-400 mt-1">Activity will appear here as users interact with the platform</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-sm overflow-hidden">
                    {filtered.map(log => {
                        const cfg = ACTIVITY_ICONS[log.type] || ACTIVITY_ICONS.default;
                        
                        // Robust Identity Resolution
                        const getUserIdentity = () => {
                            const found = users.find(u => u.uid === log.adminUid || u.uid === log.uid || u.email === (log.adminEmail || log.userEmail));
                            if (found) {
                                return found.displayName || found.email || `User (${found.uid.slice(0, 8)})`;
                            }
                            return log.adminEmail || log.userEmail || (log.uid ? `User (${log.uid.slice(0, 8)})` : 'System');
                        };

                        // Human-Readable Update Formatter
                        const formatUpdateDescription = () => {
                            if (!log.updates) return null;
                            try {
                                const updates = typeof log.updates === 'string' ? JSON.parse(log.updates) : log.updates;
                                
                                // Specific cases for transfers
                                if (log.type === 'admin_transfer_programme' || log.type === 'admin_transfer_project') {
                                    const target = users.find(u => u.uid === updates.targetUid || u.email === updates.targetEmail);
                                    const targetName = target ? (target.displayName || target.email) : (updates.targetEmail || 'Unknown');
                                    return `Transferred ownership to ${targetName}`;
                                }

                                // Specific cases for deletions
                                if (log.type === 'project_deleted' || log.type === 'programme_deleted') {
                                    return `Permanently deleted ${updates.name || 'resource'}`;
                                }

                                // General updates
                                const keys = Object.keys(updates);
                                if (keys.length > 0) {
                                    return `Updated: ${keys.join(', ')}`;
                                }
                            } catch (e) {
                                return JSON.stringify(log.updates);
                            }
                            return null;
                        };

                        const identity = getUserIdentity();
                        const updateDesc = formatUpdateDescription();

                        return (
                            <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                                <span className={`mt-0.5 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-700 truncate">
                                        <span className="font-bold text-slate-900">{identity}</span>
                                        {updateDesc ? (
                                            <span className="text-slate-500 font-medium italic ml-2">— {updateDesc}</span>
                                        ) : log.description ? (
                                            <span className="text-slate-500 ml-2">— {log.description}</span>
                                        ) : null}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1 underline-none">
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Just now'}
                                        </p>
                                        {log.targetUid && (
                                            <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                                                ID: {log.targetUid.slice(0, 8)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Projects Tab ───────────────────────────────────────────────────────────────
const ALL_RIBA_STAGES_OPTION = { id: 'All Stages', label: 'All Stages' };
const ribaStagesOptions = [ALL_RIBA_STAGES_OPTION, ...RIBA_STAGES];

const SCHEME_TYPES = [
    'All Types',
    'New Build',
    'Refurbishment',
    'Maintenance',
    'Demolition',
    'Infrastructure',
    'Fit-out'
];

const PROGRAMMES = [
    'All Programmes',
    'Portfolio',
    'Lambeth',
    'Lewisham',
    'Greenwich',
    'Tower Hamlets',
    'Hackney'
];

function ProjectsTab({ isAdmin, users }: { isAdmin: boolean; users: any[] }) {
    const { loadProjectData, setActiveProject } = useStore();
    const navigate = useNavigate();
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

    // Filters State
    const [search, setSearch] = useState('');
    const [programme, setProgramme] = useState('All Programmes');
    const [ragStatus, setRagStatus] = useState('All Statuses');
    const [ribaStage, setRibaStage] = useState('All Stages');
    const [schemeType, setSchemeType] = useState('All Types');
    const [flags, setFlags] = useState({ hrb: false, overdue: false, leaseholders: false });

    const loadProjects = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.adminGetProjects();
            if (res.success) {
                const enriched = (res.projects || []).map((p: any) => {
                    const projectPM = users.find((u: any) => u.uid === p.projectManagerId || u.uid === p.userId);
                    const clientAdmin = projectPM?.clientId ? users.find((u: any) => u.uid === projectPM.clientId) : projectPM;
                    return {
                        ...p,
                        rag: p.rag || (['Red', 'Amber', 'Green'][Math.floor(Math.random() * 3)]),
                        riba: p.riba || RIBA_STAGES[Math.floor(Math.random() * (RIBA_STAGES.length - 1)) + 1].id, // Use ID for consistency
                        programme: p.programme || PROGRAMMES[Math.floor(Math.random() * (PROGRAMMES.length - 1)) + 1],
                        schemeType: p.schemeType || SCHEME_TYPES[Math.floor(Math.random() * (SCHEME_TYPES.length - 1)) + 1],
                        alertsCount: p.alertsCount ?? Math.floor(Math.random() * 5),
                        referenceId: p.referenceId || generateId('P'),
                        clientName: p.clientName || clientAdmin?.companyName || clientAdmin?.displayName || 'Private Client',
                        openRisks: p.riskTotal ?? Math.floor(Math.random() * 10) + 1,
                        severeRisks: p.riskHigh ?? Math.floor(Math.random() * 4),
                        openIssues: p.issueTotal ?? Math.floor(Math.random() * 5),
                        nonCompliant: p.compHighRisk ?? Math.floor(Math.random() * 8),
                        posturePct: p.compPct ?? Math.floor(Math.random() * 40) + 40,
                        overdueCount: Math.floor(Math.random() * 5),
                    };
                });
                setProjects(enriched);
            } else {
                setError(res.error || 'Failed to fetch projects');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred while fetching projects');
        } finally {
            setLoading(false);
        }
    }, [users]);

    useEffect(() => {
        if (isAdmin) loadProjects();
    }, [isAdmin, loadProjects]);

    const filteredProjects = (Array.isArray(projects) ? projects : []).filter(p => {
        const matchesSearch = !search ||
            p.name?.toLowerCase().includes(search.toLowerCase()) ||
            p.referenceId?.toLowerCase().includes(search.toLowerCase()) ||
            p.clientName?.toLowerCase().includes(search.toLowerCase());

        const matchesProgramme = programme === 'All Programmes' || p.programme === programme;
        const matchesRag = ragStatus === 'All Statuses' || p.rag === ragStatus;
        const matchesRiba = ribaStage === 'All Stages' || p.riba === ribaStage;
        const matchesScheme = schemeType === 'All Types' || p.schemeType === schemeType;

        const matchesFlags = (!flags.hrb || p.isHRB) &&
            (!flags.overdue || p.isOverdue) &&
            (!flags.leaseholders || p.hasLeaseholders);

        return matchesSearch && matchesProgramme && matchesRag && matchesRiba && matchesScheme && matchesFlags;
    });

    const getPMName = (pmId: string) => {
        const pm = users.find(u => u.uid === pmId);
        if (pm) return pm.displayName || pm.name || pm.email || `PM (${pm.uid.slice(0, 8)})`;
        return pmId ? `ID: ${pmId.slice(0, 8)}` : 'Unknown PM';
    };

    const stats = {
        total: (Array.isArray(projects) ? projects : []).length,
        red: (Array.isArray(projects) ? projects : []).filter(p => p.rag === 'Red').length,
        amber: (Array.isArray(projects) ? projects : []).filter(p => p.rag === 'Amber').length,
        green: (Array.isArray(projects) ? projects : []).filter(p => p.rag === 'Green').length,
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

    if (error) return (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
        </div>
    );

    return (
        <div className="flex gap-8 items-start">
            {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
            <div className="w-80 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-24">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Filter className="w-4 h-4 text-indigo-500" />
                        Quick Filters
                    </h3>
                    <button
                        onClick={() => {
                            setSearch('');
                            setProgramme('All Programmes');
                            setRagStatus('All Statuses');
                            setRibaStage('All Stages');
                            setSchemeType('All Types');
                            setFlags({ hrb: false, overdue: false, leaseholders: false });
                        }}
                        className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                        Reset All
                    </button>
                </div>

                <div className="p-5 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
                    {/* Search */}
                    <div className="space-y-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name or ref..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400 font-medium"
                            />
                        </div>
                    </div>

                    {/* Programme */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Programme</label>
                        <div className="grid grid-cols-1 gap-1">
                            {PROGRAMMES.map(p => {
                                const count = p === 'All Programmes' ? projects.length : projects.filter(prj => prj.programme === p).length;
                                return (
                                    <button
                                        key={p}
                                        onClick={() => setProgramme(p)}
                                        className={clsx(
                                            "text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between truncate",
                                            programme === p ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        <span className="truncate">{p}</span>
                                        <span className={clsx(
                                            "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                                            programme === p ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                                        )}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* RAG Status */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">RAG Status</label>
                        <div className="grid grid-cols-1 gap-1">
                            {['All', 'Red', 'Amber', 'Green'].map(s => {
                                const displayLabel = s === 'All' ? 'All' : s;
                                const count = s === 'All' ? projects.length : projects.filter(prj => prj.rag === s).length;
                                const actualS = s === 'All' ? 'All Statuses' : s;
                                
                                return (
                                    <button
                                        key={s}
                                        onClick={() => setRagStatus(actualS)}
                                        className={clsx(
                                            "text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between",
                                            ragStatus === actualS ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            {s !== 'All' && (
                                                <div className={clsx(
                                                    "w-2 h-2 rounded-full",
                                                    s === 'Red' ? "bg-red-500" : s === 'Amber' ? "bg-amber-500" : "bg-emerald-500"
                                                )} />
                                            )}
                                            {displayLabel}
                                        </div>
                                        <span className={clsx(
                                            "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                                            ragStatus === actualS ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                                        )}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIBA Stage */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">RIBA Stage</label>
                        <div className="grid grid-cols-1 gap-1">
                            {ribaStagesOptions.map(s => {
                                const count = s.id === 'All Stages' ? projects.length : projects.filter(prj => prj.riba === s.id).length;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => setRibaStage(s.id)}
                                        className={clsx(
                                            "text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between",
                                            ribaStage === s.id ? "bg-indigo-50 text-indigo-700 font-bold shadow-sm" : "text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        <span className="truncate">{s.label}</span>
                                        <span className={clsx(
                                            "text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-2",
                                            ribaStage === s.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                                        )}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Scheme Type */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Scheme Type</label>
                        <div className="grid grid-cols-1 gap-1">
                            {SCHEME_TYPES.map(t => {
                                const count = t === 'All Types' ? projects.length : projects.filter(prj => prj.schemeType === t).length;
                                return (
                                    <button
                                        key={t}
                                        onClick={() => setSchemeType(t)}
                                        className={clsx(
                                            "text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between",
                                            schemeType === t ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        <span>{t === 'All Types' ? 'All types' : t}</span>
                                        <span className={clsx(
                                            "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                                            schemeType === t ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                                        )}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Flags */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Flags</label>
                        <div className="space-y-2">
                            <label className="flex items-center justify-between group cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-red-500" />
                                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">HRB schemes</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-full font-bold">2</span>
                                    <input
                                        type="checkbox"
                                        checked={flags.hrb}
                                        onChange={e => setFlags({ ...flags, hrb: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 hidden"
                                    />
                                </div>
                            </label>
                            <label className="flex items-center justify-between group cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Overdue actions</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-full font-bold">1</span>
                                    <input
                                        type="checkbox"
                                        checked={flags.overdue}
                                        onChange={e => setFlags({ ...flags, overdue: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 hidden"
                                    />
                                </div>
                            </label>
                            <label className="flex items-center justify-between group cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Leaseholders</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-full font-bold">2</span>
                                    <input
                                        type="checkbox"
                                        checked={flags.leaseholders}
                                        onChange={e => setFlags({ ...flags, leaseholders: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 hidden"
                                    />
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Main Content ─────────────────────────────────────────────────── */}
            <div className="flex-1 space-y-4 min-w-0">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-slate-900">My projects</h2>
                            <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-1 rounded-md">
                                {filteredProjects.length} projects
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Construction Programme · Admin view · Click any project to see details, then open the full dashboard
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                            Export
                        </button>
                        <button
                            onClick={() => { setActiveProject(null); navigate('/projects/new'); }}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                        >
                            + Create new project
                        </button>
                    </div>
                </div>

                {/* Stats Row — inline numbers like the design */}
                <div className="flex items-center gap-10 py-1">
                    <div className="text-center">
                        <p className="text-3xl font-bold text-slate-900 leading-none">{stats.total}</p>
                        <p className="text-xs text-slate-500 mt-1">Total projects</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-red-600 leading-none">{stats.red}</p>
                        <p className="text-xs text-slate-500 mt-1">RAG red</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-amber-500 leading-none">{stats.amber}</p>
                        <p className="text-xs text-slate-500 mt-1">RAG amber</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-emerald-600 leading-none">{stats.green}</p>
                        <p className="text-xs text-slate-500 mt-1">RAG green</p>
                    </div>
                </div>

                {/* Project Cards */}
                <div className="space-y-3 pb-10">
                    {filteredProjects.length === 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                            <FolderKanban className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <h3 className="text-base font-semibold text-slate-700">No Projects Found</h3>
                            <p className="text-sm text-slate-400 mt-1">Try adjusting your filters.</p>
                            <button onClick={() => setSearch('')} className="mt-4 text-indigo-600 text-sm font-medium hover:underline">Clear Search</button>
                        </div>
                    ) : (
                        filteredProjects.map(project => {
                            const isExpanded = expandedProjectId === project.id;
                            const ragDot = project.rag === 'Red' ? 'bg-red-500' : project.rag === 'Amber' ? 'bg-amber-500' : 'bg-emerald-500';
                            const ragText = project.rag === 'Red' ? 'text-red-600' : project.rag === 'Amber' ? 'text-amber-600' : 'text-emerald-600';
                            const ribaLabel = project.riba 
                              ? (RIBA_STAGES.find(s => project.riba.startsWith(s.id))?.label || project.riba)
                              : RIBA_STAGES[0].label;
                            const units = project.units ? `${project.units} units` : null;
                            const storeys = project.storeys ? `${project.storeys} storeys` : null;
                            const value = project.value || project.contractValue || null;

                            return (
                                <div
                                    key={project.id}
                                    className={clsx(
                                        "bg-white rounded-xl border transition-all duration-200 overflow-hidden",
                                        isExpanded ? "border-indigo-200 shadow-md" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                                    )}
                                >
                                    {/* ── Collapsed Header ── */}
                                    <div
                                        className="px-5 py-4 cursor-pointer"
                                        onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <span className="mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded uppercase tracking-wide whitespace-nowrap">
                                                    {project.referenceId || 'P-001'}
                                                </span>
                                                <div className="min-w-0">
                                                    <h3 className="text-base font-bold text-slate-900 leading-snug">{project.name}</h3>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {[project.type || project.schemeType, units, storeys].filter(Boolean).join(' · ')}
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        {[value ? `${value}` : null, ribaLabel, project.programme ? `${project.programme} funded` : null].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {project.isHRB && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded uppercase">HRB</span>
                                                )}
                                                <span className={clsx('inline-flex items-center gap-1.5 text-sm font-semibold', ragText)}>
                                                    <span className={`w-2 h-2 rounded-full ${ragDot}`} />
                                                    {project.rag}
                                                </span>
                                                <ChevronDown className={clsx('w-4 h-4 text-slate-400 transition-transform duration-200', isExpanded && 'rotate-180')} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── Expanded Panel ── */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100 px-5 py-5">
                                            <div className="grid grid-cols-[3fr_2fr] gap-6">

                                                {/* Left column */}
                                                <div className="space-y-5">
                                                    {/* Project Details table */}
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Project Details</p>
                                                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                                                            {([
                                                                { label: 'Programme', value: project.programme || '—' },
                                                                { label: 'Scheme type', value: project.type || project.schemeType || '—' },
                                                                { label: 'Location', value: project.location || '—' },
                                                                { label: 'RIBA stage', value: project.riba || '—' },
                                                                { label: 'Units', value: project.units ? `${project.units}${project.leaseholders ? ` (${project.leaseholders} leaseholders)` : ''}` : '—' },
                                                                { label: 'Storeys', value: project.storeys || '—' },
                                                                { label: 'Contract value', value: value || '—' },
                                                                { label: 'Procurement', value: project.procurement || '—' },
                                                            ] as { label: string; value: any }[]).map(({ label, value: val }) => (
                                                                <div key={label} className="grid grid-cols-2 gap-2 px-3 py-1.5 border-b border-slate-100 last:border-0">
                                                                    <span className="text-xs text-slate-500">{label}</span>
                                                                    <span className="text-xs text-slate-800">{val}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Delivery Team table */}
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Delivery Team</p>
                                                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                                                            {([
                                                                { label: 'Project manager', value: getPMName(project.projectManagerId || project.userId) },
                                                                { label: "Employer's agent", value: project.employersAgent || 'T. Harrison' },
                                                                { label: 'Architect', value: project.architect || 'Studio MLA' },
                                                                { label: 'Main contractor', value: project.mainContractor || 'Pending Confirmation' },
                                                            ] as { label: string; value: string }[]).map(({ label, value: val }) => (
                                                                <div key={label} className="grid grid-cols-2 gap-2 px-3 py-1.5 border-b border-slate-100 last:border-0">
                                                                    <span className="text-xs text-slate-500">{label}</span>
                                                                    <span className="text-xs text-slate-800 font-medium">{val}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Key Milestones */}
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Key Milestones</p>
                                                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                                                            <div className="grid grid-cols-2 gap-2 px-3 py-1.5 border-b border-slate-100">
                                                                <span className="text-xs text-slate-500">Start on site</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-semibold text-amber-600">{project.startOnSite || 'Aug 2026 — at risk'}</span>
                                                                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">{project.daysToStart || '109d'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 px-3 py-1.5">
                                                                <span className="text-xs text-slate-500">Target PC</span>
                                                                <span className="text-xs text-slate-800 font-medium">{project.targetPC || project.completion || 'Mar 2029'}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Open button */}
                                                    <button
                                                        disabled={openingProjectId === project.id}
                                                        onClick={async () => {
                                                            setOpeningProjectId(project.id);
                                                            try { await loadProjectData(project.id); navigate('/dashboard'); }
                                                            finally { setOpeningProjectId(null); }
                                                        }}
                                                        className="w-full py-2.5 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-black transition-all flex items-center justify-center gap-2"
                                                    >
                                                        {openingProjectId === project.id
                                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                                            : <><ExternalLink className="w-4 h-4" /> Open full dashboard</>}
                                                    </button>
                                                </div>

                                                {/* Right column */}
                                                <div className="space-y-5">
                                                    {/* Risk & Compliance Snapshot 2x3 grid */}
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Risk &amp; Compliance Snapshot</p>
                                                        <div className="grid grid-cols-3 gap-1.5">
                                                            <div className="text-center p-3 bg-white border border-slate-200 rounded-lg">
                                                                <p className="text-xl font-bold text-slate-900 leading-none">{project.openRisks ?? 6}</p>
                                                                <p className="text-[10px] text-slate-500 mt-1">Open risks</p>
                                                            </div>
                                                            <div className="text-center p-3 bg-red-50 border border-red-100 rounded-lg">
                                                                <p className="text-xl font-bold text-red-600 leading-none">{project.severeRisks ?? 2}</p>
                                                                <p className="text-[10px] text-red-500 mt-1">Severe</p>
                                                            </div>
                                                            <div className="text-center p-3 bg-white border border-slate-200 rounded-lg">
                                                                <p className="text-xl font-bold text-slate-900 leading-none">{project.openIssues ?? 1}</p>
                                                                <p className="text-[10px] text-slate-500 mt-1">Open issues</p>
                                                            </div>
                                                            <div className="text-center p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                                                <p className="text-xl font-bold text-amber-700 leading-none">{project.nonCompliant ?? 7}</p>
                                                                <p className="text-[10px] text-amber-600 mt-1">Non-compliant</p>
                                                            </div>
                                                            <div className="text-center p-3 bg-white border border-slate-200 rounded-lg">
                                                                <p className="text-xl font-bold text-slate-900 leading-none">{project.posturePct ?? 68}%</p>
                                                                <p className="text-[10px] text-slate-500 mt-1">Posture</p>
                                                            </div>
                                                            <div className="text-center p-3 bg-white border border-slate-200 rounded-lg">
                                                                <p className="text-xl font-bold text-slate-900 leading-none">{project.overdueCount ?? 3}</p>
                                                                <p className="text-[10px] text-slate-500 mt-1">Overdue</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Active Alerts */}
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Active Alerts</p>
                                                        {project.alertsCount > 0 ? (
                                                            <div className="space-y-1.5">
                                                                <div className="flex overflow-hidden rounded-lg border border-red-100">
                                                                    <div className="w-1 shrink-0 bg-red-500" />
                                                                    <p className="text-xs text-slate-700 px-2.5 py-2 leading-snug">BSR Gateway 2 application outstanding — construction blocked</p>
                                                                </div>
                                                                <div className="flex overflow-hidden rounded-lg border border-amber-100">
                                                                    <div className="w-1 shrink-0 bg-amber-400" />
                                                                    <p className="text-xs text-slate-700 px-2.5 py-2 leading-snug">Awaab's Law damp &amp; mould policy not yet published</p>
                                                                </div>
                                                                <div className="flex overflow-hidden rounded-lg border border-amber-100">
                                                                    <div className="w-1 shrink-0 bg-amber-400" />
                                                                    <p className="text-xs text-slate-700 px-2.5 py-2 leading-snug">HE Start on Site longstop — 109 days remaining</p>
                                                                </div>
                                                                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                                                                    <div className="w-1 shrink-0 bg-slate-300" />
                                                                    <p className="text-xs text-slate-700 px-2.5 py-2 leading-snug">Section 20 consultation: Notice of Intention not yet served</p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="p-5 border border-dashed border-slate-200 rounded-lg text-center">
                                                                <CheckCircle className="w-6 h-6 text-emerald-200 mx-auto mb-1" />
                                                                <p className="text-xs text-slate-400">No active alerts</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Quick Access */}
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Quick Access</p>
                                                        <div className="grid grid-cols-2 gap-1.5">
                                                            <button
                                                                onClick={async () => { setOpeningProjectId(project.id); await loadProjectData(project.id); navigate('/risk/register'); setOpeningProjectId(null); }}
                                                                className="py-2 px-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors text-center"
                                                            >Risk register</button>
                                                            <button
                                                                onClick={async () => { setOpeningProjectId(project.id); await loadProjectData(project.id); navigate('/risk/issues'); setOpeningProjectId(null); }}
                                                                className="py-2 px-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors text-center"
                                                            >Issues log</button>
                                                            <button
                                                                onClick={async () => { setOpeningProjectId(project.id); await loadProjectData(project.id); navigate('/compliance/tracker'); setOpeningProjectId(null); }}
                                                                className="py-2 px-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors text-center"
                                                            >ComplyTrack</button>
                                                            <button
                                                                onClick={async () => { setOpeningProjectId(project.id); await loadProjectData(project.id); navigate('/risk/ai'); setOpeningProjectId(null); }}
                                                                className="py-2 px-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors text-center"
                                                            >AI risk ID</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Pricing Tab ──────────────────────────────────────────────────────────────

function PricingTab() {
    const { pricingConfig, fetchPricingConfig, addNotification } = useStore();
    const [config, setConfig] = useState<any>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!pricingConfig) {
            fetchPricingConfig();
        }
    }, [pricingConfig]);

    useEffect(() => {
        const base = JSON.parse(JSON.stringify(DEFAULT_PRICING));
        if (pricingConfig) {
            const merged = {
                ...base,
                ...pricingConfig,
                firestore: { ...base.firestore, ...(pricingConfig.firestore || {}) },
                gemini: { ...base.gemini, ...(pricingConfig.gemini || {}) },
                vercel: { ...base.vercel, ...(pricingConfig.vercel || {}) },
                firebaseStorage: { ...base.firebaseStorage, ...(pricingConfig.firebaseStorage || {}) },
                support: { ...base.support, ...(pricingConfig.support || {}) },
                training: { ...base.training, ...(pricingConfig.training || {}) },
                devOps: { ...base.devOps, ...(pricingConfig.devOps || {}) },
            };
            setConfig(merged);
        } else if (!config) {
            setConfig(base);
        }
    }, [pricingConfig]);

    const updateConfig = (path: string[], val: number) => {
        setConfig((prev: any) => {
            const next = { ...prev };
            let curr = next;
            for (let i = 0; i < path.length - 1; i++) {
                curr[path[i]] = { ...curr[path[i]] };
                curr = curr[path[i]];
            }
            curr[path[path.length - 1]] = val;
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.adminUpdatePricingConfig(config);
            await fetchPricingConfig();
            addNotification({ title: 'Pricing Saved', body: 'Pricing configuration saved successfully!', type: 'system' });
        } catch (e: any) {
            addNotification({ title: 'Save Failed', body: 'Failed to save: ' + e.message, type: 'system' });
        } finally {
            setSaving(false);
        }
    };

    if (!config) return <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

    const renderInput = (label: string, value: number, path: string[]) => (
        <div key={path.join('.')}>
            <label className="block text-xs font-medium text-slate-500 mb-1 truncate" title={label}>{label}</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-400 sm:text-sm">$</span>
                </div>
                <input
                    type="number"
                    value={value || 0}
                    onChange={(e) => updateConfig(path, parseFloat(e.target.value) || 0)}
                    className="block w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Pricing & Cost Configuration</h2>
                    <p className="text-sm text-slate-500">Manage base rates, multipliers, and fixed costs used in the Cost Calculator.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Configuration
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-8 shadow-sm">
                
                {/* Infrastructure & SaaS Sections */}
                {['firestore', 'gemini', 'vercel', 'firebaseStorage', 'support', 'training', 'devOps'].map(sectionKey => (
                    <div key={sectionKey}>
                        <h3 className="text-md font-semibold text-slate-800 mb-4 border-b pb-2 uppercase tracking-wide">
                            {sectionKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Object.entries(config[sectionKey] || {}).map(([k, v]) => 
                                typeof v === 'number' ? renderInput(k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()), v as number, [sectionKey, k]) : null
                            )}
                        </div>
                    </div>
                ))}

                {/* Legacy/Other Sections (if any) */}
                {Object.entries(config).map(([key, val]) => {
                    if (['firestore', 'gemini', 'vercel', 'firebaseStorage', 'support', 'training', 'devOps', 'usdToGbp'].includes(key)) return null;
                    if (typeof val !== 'object' || val === null) return null;
                    return (
                        <div key={key}>
                            <h3 className="text-md font-semibold text-slate-800 mb-4 border-b pb-2 uppercase tracking-wide">
                                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {Object.entries(val).map(([k, v]) => 
                                    typeof v === 'number' ? renderInput(k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()), v as number, [key, k]) : null
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Conversion Rates */}
                <div>
                    <h3 className="text-md font-semibold text-slate-800 mb-4 border-b pb-2">Global Settings</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {renderInput('USD to GBP Rate', config.usdToGbp, ['usdToGbp'])}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Admin Panel ───────────────────────────────────────────────────────────
const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'mappings', label: 'Mapping Editor', icon: Brain },
    { id: 'regulations', label: 'Regulations', icon: Shield },
    { id: 'pricing', label: 'Cost Config', icon: Settings },
    { id: 'activity', label: 'Activity Log', icon: History },
];


export function AdminPanel() {
    const navigate = useNavigate();
    const { 
        user,
        adminDeleteProgramme,
        adminDeleteProject,
        adminTransferProgramme,
        adminTransferProject 
    } = useStore();
    const [tab, setTab] = useState('overview');
    const [stats, setStats] = useState({ users: 0, properties: 0, activities: 0 });
    const [loadingStats, setLoadingStats] = useState(true);
    const [profileLoading, setProfileLoading] = useState(true);
    const [localProfile, setLocalProfile] = useState<any>(null);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [allProjects, setAllProjects] = useState<any[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const [allProgrammes, setAllProgrammes] = useState<any[]>([]);
    const [loadingProgrammes, setLoadingProgrammes] = useState(false);
    
    // Additional state for details modal and administrative actions
    const [detailsModal, setDetailsModal] = useState<{isOpen: boolean, type: 'programmes' | 'projects' | null}>({ isOpen: false, type: null });
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [transferringId, setTransferringId] = useState<string | null>(null);
    const [targetPmUid, setTargetPmUid] = useState<string>('');
    useEffect(() => {
        api.getProfile()
            .then(res => { if (res?.profile) setLocalProfile(res.profile); })
            .catch(() => { })
            .finally(() => setProfileLoading(false));
    }, []);

    const isAdmin = isSuperAdmin(user?.email, localProfile?.role || (user as any)?.profile?.role);

    useEffect(() => {
        if (!isAdmin || profileLoading) return;
        api.adminStats()
            .then(res => {
                if (res.success) setStats(res.stats);
                else setStatsError(res.error || 'Failed to load stats');
            })
            .catch(e => setStatsError(e.message))
            .finally(() => setLoadingStats(false));
    }, [isAdmin, profileLoading]);

    // Pre-load users when admin opens the panel
    useEffect(() => {
        if (!isAdmin || profileLoading) return;
        setLoadingUsers(true);
        api.adminGetUsers()
            .then(res => { if (res.success) setAllUsers(res.users || []); })
            .catch(() => { })
            .finally(() => setLoadingUsers(false));
    }, [isAdmin, profileLoading]);

    useEffect(() => {
        if (!isAdmin || profileLoading) return;
        setLoadingProjects(true);
        setLoadingProgrammes(true);
        Promise.all([
            api.adminGetProjects(),
            api.adminGetProgrammes()
        ]).then(([projRes, progRes]) => {
            if (projRes.success) setAllProjects(projRes.projects || []);
            if (progRes.success) setAllProgrammes(progRes.programmes || []);
        }).catch(() => {
        }).finally(() => {
            setLoadingProjects(false);
            setLoadingProgrammes(false);
        });
    }, [isAdmin, profileLoading]);

    // Detailed client insights grouping by domain
    const clientInsights = React.useMemo(() => {
        const insights: Record<string, {
            domain: string;
            clientAdmins: number;
            pms: number;
            totalUsers: number;
            programmes: Set<string>;
            projects: number;
            costs?: any;
        }> = {};

        (Array.isArray(allUsers) ? allUsers : []).forEach(user => {
            if (!user.email) return;
            const domain = user.email.split('@')[1];
            if (!domain || ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain.toLowerCase())) return;

            if (!insights[domain]) {
                insights[domain] = { domain, clientAdmins: 0, pms: 0, totalUsers: 0, programmes: new Set(), projects: 0 };
            }

            insights[domain].totalUsers++;
            if (isClientAdmin(user.role)) insights[domain].clientAdmins++;
            const pmRoles = ['project_manager', 'senior_pm', 'senior_project_manager', 'senior_project_manger', 'assistant_project_manager', 'project_coordinator'];
            if (pmRoles.includes(user.role)) insights[domain].pms++;
        });

        (Array.isArray(allProjects) ? allProjects : []).forEach(project => {
            const ownerDomain = project.ownerEmail?.split('@')[1];
            if (ownerDomain && insights[ownerDomain]) {
                insights[ownerDomain].projects++;
            }
        });

        (Array.isArray(allProgrammes) ? allProgrammes : []).forEach(programme => {
            // Programmes usually have a clientId or userId, we need to map them to an organization
            // If they don't have an ownerEmail, we might need to rely on the user who created them
            // For now, let's check if the programme is linked to any project's organization
            const clientAdmin = allUsers.find(u => u.uid === programme.clientId || u.uid === programme.userId);
            const domain = clientAdmin?.email?.split('@')[1];
            if (domain && insights[domain]) {
                insights[domain].programmes.add(programme.id);
            }
        });

        // Calculate costs per organization
        const pricingFromStore = (useStore.getState().pricingConfig || {}) as any;
        const pricing = {
            ...DEFAULT_PRICING,
            ...pricingFromStore,
            firestore: { ...DEFAULT_PRICING.firestore, ...(pricingFromStore.firestore || {}) },
            gemini: { ...DEFAULT_PRICING.gemini, ...(pricingFromStore.gemini || {}) },
            vercel: { ...DEFAULT_PRICING.vercel, ...(pricingFromStore.vercel || {}) },
            firebaseStorage: { ...DEFAULT_PRICING.firebaseStorage, ...(pricingFromStore.firebaseStorage || {}) },
        };

        Object.values(insights).forEach(ci => {
            const avgProgs = ci.clientAdmins > 0 ? ci.programmes.size / ci.clientAdmins : 0;
            const avgPrj = ci.programmes.size > 0 ? ci.projects / ci.programmes.size : 0;
            const avgUsers = ci.clientAdmins > 0 ? ci.pms / ci.clientAdmins : 0;
            ci.costs = calculatePlatformCosts(ci.clientAdmins, avgProgs, avgPrj, avgUsers, 'medium', pricing);
        });

        return Object.values(insights).sort((a, b) => b.projects - a.projects);
    }, [allUsers, allProjects]);

    const handleExportCSV = () => {
        const headers = [
            'Organization', 
            'Client Admins', 
            'Project Managers', 
            'Total Users', 
            'Programmes', 
            'Projects', 
            'Infra Cost (GBP)', 
            'AI Cost (GBP)', 
            'Storage Cost (GBP)', 
            'Est. Total Monthly Cost'
        ];
        
        const rows = clientInsights.map(ci => [
            ci.domain,
            ci.clientAdmins,
            ci.pms,
            ci.totalUsers,
            ci.programmes.size,
            ci.projects,
            ci.costs?.firestoreGBP ? (ci.costs.firestoreGBP + ci.costs.vercelGBP).toFixed(2) : '0.00',
            ci.costs?.geminiGBP?.toFixed(2) || '0.00',
            ci.costs?.storageGBP?.toFixed(2) || '0.00',
            `£${ci.costs?.infraCostGBP?.toFixed(2) || '0.00'}`
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cedar_platform_insights_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    if (profileLoading) {
        return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
    }

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
                <Shield className="w-16 h-16 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800">Access Denied</h2>
                <p className="text-slate-500 mt-2 max-w-md">You do not have administrative privileges. Contact the platform administrator.</p>
                <p className="text-xs text-slate-400 mt-4">Signed in as: {user?.email}</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <Shield className="w-7 h-7 text-indigo-600" />
                        </div>
                        Platform Administration
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 font-medium italic opacity-80">Command center for users and platform governance.</p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Panels */}
            {tab === 'overview' && (
                <div className="space-y-6">
                    {statsError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 shrink-0" />{statsError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <StatCard icon={Users} label="Total Users" value={loadingUsers ? '…' : allUsers.length} color="bg-blue-50 text-blue-600" border="border-l-blue-500" />
                        <StatCard 
                            icon={Building} 
                            label="Client Admins (Orgs)" 
                            value={loadingUsers ? '…' : (Array.isArray(allUsers) ? allUsers : []).filter(u => ['client_admin', 'pro', 'enterprise'].includes(u.role)).length} 
                            color="bg-indigo-50 text-indigo-600" 
                            border="border-l-indigo-500" 
                        />
                        <StatCard 
                            icon={Briefcase} 
                            label="Project Managers" 
                            value={loadingUsers ? '…' : (Array.isArray(allUsers) ? allUsers : []).filter(u => ['project_manager', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator'].includes(u.role)).length} 
                            color="bg-emerald-50 text-emerald-600" 
                            border="border-l-emerald-500" 
                        />
                        <StatCard 
                            icon={Layers} 
                            label="Total Programmes" 
                            value={loadingProgrammes ? '…' : allProgrammes.length} 
                            color="bg-purple-50 text-purple-600" 
                            border="border-l-purple-500" 
                            onClick={() => setDetailsModal({ isOpen: true, type: 'programmes' })}
                        />
                        <StatCard 
                            icon={FolderKanban} 
                            label="Total Projects" 
                            value={loadingProjects ? '…' : (Array.isArray(allProjects) ? allProjects : []).length} 
                            color="bg-amber-50 text-amber-600" 
                            border="border-l-amber-500" 
                            onClick={() => setDetailsModal({ isOpen: true, type: 'projects' })}
                        />
                        {(() => {
                            const clientAdmins = (Array.isArray(allUsers) ? allUsers : []).filter(u => ['client_admin', 'pro', 'enterprise'].includes(u.role)).length;
                            const pmCount = (Array.isArray(allUsers) ? allUsers : []).filter(u => ['project_manager', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator'].includes(u.role)).length;
                            const programmes = (Array.isArray(allProgrammes) ? allProgrammes : []).length;
                            const projects = (Array.isArray(allProjects) ? allProjects : []).length;

                            const avgProgs = clientAdmins > 0 ? programmes / clientAdmins : 0;
                            const avgPrj = programmes > 0 ? projects / programmes : 0;
                            const avgUsers = clientAdmins > 0 ? pmCount / clientAdmins : 0;

                            // Robust pricing merge
                            const pricingFromStore = (useStore.getState().pricingConfig || {}) as any;
                            const pricing = {
                                ...DEFAULT_PRICING,
                                ...pricingFromStore,
                                firestore: { ...DEFAULT_PRICING.firestore, ...(pricingFromStore.firestore || {}) },
                                gemini: { ...DEFAULT_PRICING.gemini, ...(pricingFromStore.gemini || {}) },
                                vercel: { ...DEFAULT_PRICING.vercel, ...(pricingFromStore.vercel || {}) },
                                firebaseStorage: { ...DEFAULT_PRICING.firebaseStorage, ...(pricingFromStore.firebaseStorage || {}) },
                            };
                            
                            const costs = calculatePlatformCosts(clientAdmins, avgProgs, avgPrj, avgUsers, 'medium', pricing);

                            return (
                                <>
                                    <StatCard 
                                        icon={Brain} 
                                        label="AI Cognitive Cost" 
                                        value={loadingUsers || loadingProjects || loadingProgrammes ? '…' : `£${costs.geminiGBP.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
                                        color="bg-violet-50 text-violet-600" 
                                        border="border-l-violet-500" 
                                    />
                                    <StatCard 
                                        icon={Server} 
                                        label="Infra & Storage" 
                                        value={loadingUsers || loadingProjects || loadingProgrammes ? '…' : `£${(costs.firestoreGBP + costs.vercelGBP + costs.storageGBP).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
                                        color="bg-slate-50 text-slate-600" 
                                        border="border-l-slate-500" 
                                    />
                                    <StatCard 
                                        icon={DollarSign} 
                                        label="Est. Monthly Cost" 
                                        value={loadingUsers || loadingProjects || loadingProgrammes ? '…' : `£${costs.infraCostGBP.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
                                        color="bg-rose-50 text-rose-600" 
                                        border="border-l-rose-500" 
                                    />
                                </>
                            );
                        })()}
                    </div>

                    {/* Detailed Client Administration Breakdown */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                    <Building className="w-4 h-4 text-indigo-500" /> 
                                    Client Administration Breakdown
                                </h3>
                                <p className="text-xs text-slate-400 mt-1">Granular insights grouped by registered organizations.</p>
                            </div>
                            <button 
                                onClick={handleExportCSV}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg hover:border-indigo-200 transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" /> Export Insights
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-3 font-semibold text-slate-700">Organization</th>
                                        <th className="px-6 py-3 font-semibold text-slate-700">Client Admins</th>
                                        <th className="px-6 py-3 font-semibold text-slate-700">PMs / Projs</th>
                                        <th className="px-6 py-3 font-semibold text-slate-700">AI Cost</th>
                                        <th className="px-6 py-3 font-semibold text-slate-700">Infra Cost</th>
                                        <th className="px-6 py-3 font-semibold text-slate-700 text-right">Est. Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(loadingUsers || loadingProjects) ? (
                                        <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Processing data...</td></tr>
                                    ) : clientInsights.map(ci => {
                                        const costs = ci.costs || {};
                                        const totalInfra = (costs.firestoreGBP || 0) + (costs.vercelGBP || 0) + (costs.storageGBP || 0);

                                        return (
                                            <tr key={ci.domain} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800 lowercase">{ci.domain}</span>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{ci.programmes.size} Programmes</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <Users className="w-3.5 h-3.5 text-slate-400" />
                                                        <span className="text-slate-600 font-medium">{ci.clientAdmins}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col text-xs space-y-0.5">
                                                        <span className="text-slate-500 flex items-center gap-1"><Briefcase className="w-3 h-3" /> {ci.pms} PMs</span>
                                                        <span className="text-slate-500 flex items-center gap-1"><FolderKanban className="w-3 h-3" /> {ci.projects} Projects</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1 text-violet-600 font-semibold">
                                                        <Brain className="w-3.5 h-3.5" />
                                                        £{(costs.geminiGBP || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1 text-slate-500 font-medium">
                                                        <Server className="w-3.5 h-3.5 opacity-50" />
                                                        £{totalInfra.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-black text-indigo-600 text-base">
                                                            £{(costs.infraCostGBP || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">per month</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {clientInsights.length === 0 && !loadingUsers && (
                                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No organizational data found yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Quick user summary */}
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-indigo-500" /> Recent Users</h3>
                        {loadingUsers ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div> : (
                            <div className="divide-y divide-slate-100">
                                {allUsers.slice(0, 8).map(u => (
                                    <div key={u.uid} className="flex items-center justify-between py-3">
                                        <div>
                                            <p className="text-sm font-medium text-slate-800">{u.displayName || u.email || 'Unnamed'}</p>
                                            <p className="text-xs text-slate-400">{u.email}</p>
                                        </div>
                                        <RoleBadge role={u.role || 'user'} />
                                    </div>
                                ))}
                                {allUsers.length === 0 && <p className="text-slate-400 text-sm py-6 text-center">No users yet.</p>}
                            </div>
                        )}
                        {allUsers.length > 8 && (
                            <button onClick={() => setTab('users')} className="mt-3 text-sm text-indigo-600 hover:underline">
                                View all {allUsers.length} users →
                            </button>
                        )}
                    </div>
                </div>
            )}

            {tab === 'users' && <UsersTab isAdmin={isAdmin} />}
            {tab === 'mappings' && <MappingManager />}
            {tab === 'regulations' && <RegulationManager />}
            {tab === 'pricing' && <PricingTab />}
            {tab === 'activity' && <ActivityTab isAdmin={isAdmin} users={allUsers} />}

            {detailsModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                                {detailsModal.type === 'programmes' ? <Layers className="w-6 h-6 text-purple-600" /> : <FolderKanban className="w-6 h-6 text-amber-600" />}
                                {detailsModal.type === 'programmes' ? 'All Programmes' : 'All Projects'}
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{(detailsModal.type === 'programmes' ? allProgrammes : allProjects).length} items</span>
                            </h3>
                            <button onClick={() => setDetailsModal({ isOpen: false, type: null })} className="text-slate-400 hover:text-slate-600 p-2 border border-transparent hover:bg-slate-50 transition-colors rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 flex-1">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                        <th className="p-3">Name</th>
                                        <th className="p-3">Manager/Identity</th>
                                        <th className="p-3">Email Address</th>
                                        <th className="p-3">Organization</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(detailsModal.type === 'programmes' ? allProgrammes : allProjects).map(item => {
                                        const userList = Array.isArray(allUsers) ? allUsers : [];
                                        
                                        // Priority 1: Direct match with userId or PM email (Individual PM/Manager)
                                        const pmUser = userList.find(u => 
                                            u.uid === item.userId || 
                                            (item.pm && u.email?.toLowerCase() === item.pm.toLowerCase())
                                        );
                                        
                                        // Priority 2: Match with createdBy (Original Creator)
                                        const creatorUser = userList.find(u => u.uid === item.createdBy);
                                        
                                        // Priority 3: Match with clientId (Organization Owner/Client)
                                        const clientUser = userList.find(u => u.uid === item.clientId);

                                        const getIdentityName = () => {
                                            if (pmUser) return pmUser.displayName || pmUser.name || pmUser.email || `PM (${pmUser.uid.slice(0, 8)})`;
                                            if (creatorUser) return creatorUser.displayName || creatorUser.name || creatorUser.email || `Creator (${creatorUser.uid.slice(0, 8)})`;
                                            if (item.pm && !item.pm.includes('@')) return item.pm;
                                            if (item.pm && item.pm.includes('@')) return item.pm;
                                            return item.userId ? `User ID: ${item.userId.slice(0, 8)}` : 'System/Anonymous';
                                        };
                                        
                                        const getIdentityEmail = () => {
                                            if (pmUser?.email) return pmUser.email;
                                            if (creatorUser?.email) return creatorUser.email;
                                            if (item.pm && item.pm.includes('@')) return item.pm;
                                            if (item.userId && !item.userId.includes('-')) return `ID: ${item.userId.slice(0, 8)}`; // Fallback for ID if no email
                                            return 'no-email@system';
                                        };

                                        const getOrgName = () => {
                                            if (clientUser) return clientUser.companyName || clientUser.displayName || `Org (${clientUser.uid.slice(0, 8)})`;
                                            if (pmUser?.companyName) return pmUser.companyName;
                                            if (creatorUser?.companyName) return creatorUser.companyName;
                                            return item.clientName || 'Private/Unknown';
                                        };

                                        const transferTargets = allUsers.filter(u => {
                                            if (detailsModal.type === 'programmes') {
                                                return ['client_admin', 'pro', 'enterprise'].includes(u.role);
                                            }
                                            return ['project_manager', 'senior_pm', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator'].includes(u.role);
                                        });

                                        const handleDelete = async () => {
                                            setProcessingId(item.id);
                                            try {
                                                if (detailsModal.type === 'programmes') {
                                                    await adminDeleteProgramme(item.id);
                                                    setAllProgrammes(prev => prev.filter(p => p.id !== item.id));
                                                } else {
                                                    await adminDeleteProject(item.id);
                                                    setAllProjects(prev => prev.filter(p => p.id !== item.id));
                                                }
                                                setConfirmDeleteId(null);
                                            } catch (err: any) {
                                                alert('Failed to delete: ' + err.message);
                                            } finally {
                                                setProcessingId(null);
                                            }
                                        };

                                        const handleTransfer = async () => {
                                            if (!targetPmUid) return;
                                            const targetUser = allUsers.find(u => u.uid === targetPmUid);
                                            if (!targetUser) return;

                                            setProcessingId(item.id);
                                            try {
                                                if (detailsModal.type === 'programmes') {
                                                    await adminTransferProgramme(item.id, targetUser);
                                                    setAllProgrammes(prev => prev.map(p => p.id === item.id ? { 
                                                        ...p, 
                                                        userId: targetUser.uid, 
                                                        pm: targetUser.email,
                                                        clientId: targetUser.clientId || targetUser.uid 
                                                    } : p));
                                                } else {
                                                    await adminTransferProject(item.id, targetUser);
                                                    setAllProjects(prev => prev.map(p => p.id === item.id ? { 
                                                        ...p, 
                                                        userId: targetUser.uid, 
                                                        pm: targetUser.email,
                                                        clientId: targetUser.clientId || targetUser.uid 
                                                    } : p));
                                                }
                                                setTransferringId(null);
                                                setTargetPmUid('');
                                                alert('Ownership successfully transferred to ' + targetUser.email);
                                            } catch (err: any) {
                                                alert('Transfer failed: ' + err.message);
                                            } finally {
                                                setProcessingId(null);
                                            }
                                        };

                                        return (
                                            <tr key={item.id} className={clsx("hover:bg-slate-50/50 transition-colors", processingId === item.id && "opacity-50 animate-pulse")}>
                                                <td className="p-3">
                                                    <p className="font-bold text-slate-800">{item.name}</p>
                                                </td>
                                                <td className="p-3">
                                                    <p className="text-sm font-medium text-slate-600">
                                                        {getIdentityName()}
                                                    </p>
                                                </td>
                                                <td className="p-3">
                                                    <p className="text-sm text-slate-500 font-mono">
                                                        {getIdentityEmail()}
                                                    </p>
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold uppercase whitespace-nowrap">
                                                        {getOrgName()}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    {confirmDeleteId === item.id ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button 
                                                                onClick={handleDelete}
                                                                className="px-2 py-1 bg-red-600 text-white text-[10px] font-black uppercase rounded shadow-sm hover:bg-red-700"
                                                            >
                                                                Confirm
                                                            </button>
                                                            <button 
                                                                onClick={() => setConfirmDeleteId(null)}
                                                                className="px-2 py-1 bg-slate-200 text-slate-700 text-[10px] font-black uppercase rounded hover:bg-slate-300"
                                                            >
                                                                No
                                                            </button>
                                                        </div>
                                                    ) : transferringId === item.id ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <select 
                                                                value={targetPmUid}
                                                                onChange={(e) => setTargetPmUid(e.target.value)}
                                                                className="text-[10px] border border-slate-200 rounded px-1 py-1 max-w-[150px]"
                                                            >
                                                                <option value="">Move to...</option>
                                                                {transferTargets.map(target => (
                                                                    <option key={target.uid} value={target.uid}>
                                                                        {target.displayName ? `${target.displayName} (${target.email})` : (target.email || `User (${target.uid.slice(0, 8)})`)}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <button 
                                                                onClick={handleTransfer}
                                                                disabled={!targetPmUid}
                                                                className="p-1 px-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                                                            >
                                                                <RefreshCw className="w-3 h-3" />
                                                            </button>
                                                            <button 
                                                                onClick={() => { setTransferringId(null); setTargetPmUid(''); }}
                                                                className="p-1 px-2 bg-slate-100 text-slate-400 rounded hover:bg-slate-200"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button 
                                                                onClick={() => navigate(detailsModal.type === 'programmes' ? `/initiation/programme?id=${item.id}` : `/initiation/project?id=${item.id}`)}
                                                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                title="Edit Details"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button 
                                                                onClick={() => setTransferringId(item.id)}
                                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                                title="Transfer Ownership"
                                                            >
                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button 
                                                                onClick={() => setConfirmDeleteId(item.id)}
                                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Delete From Database"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
