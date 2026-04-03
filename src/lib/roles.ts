export type UserRole = 'admin' | 'client_admin' | 'project_manager' | 'senior_pm' | 'senior_project_manager' | 'assistant_project_manager' | 'project_coordinator';

export const SUPER_ADMIN_EMAIL = 'jitbanerjeesujan@gmail.com';

export const ROLES = {
    ADMIN: 'admin',
    CLIENT_ADMIN: 'client_admin',
    PROJECT_MANAGER: 'project_manager',
} as const;

export const SYSTEM_ADMIN_EMAILS = [
    'jitbanerjeesujan@gmail.com',
    'ali@cedarguard.co.uk',
    'support@cedarguard.co.uk',
    'admin@cedarguard.co.uk',
    'anthony.baafi@gmail.com',
    'anthony@cedar-strategies.com'
];

export const isSystemAdmin = (email?: string) => {
    return !!(email && SYSTEM_ADMIN_EMAILS.includes(email.toLowerCase()));
};

export const isSuperAdmin = (email?: string, role?: string) => {
    // A Super Admin is someone with the 'admin' role OR a system admin
    return role === 'admin' || isSystemAdmin(email);
};

export const isAtLeastClientAdmin = (role?: UserRole) => {
    if (!role) return false;
    return ['admin', 'client_admin'].includes(role);
};

export const isAtLeastPM = (role?: UserRole) => {
    if (!role) return false;
    return ['admin', 'project_manager', 'senior_pm', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator'].includes(role);
};

export const canCreateProject = (role?: UserRole) => {
    if (!role) return false;
    // Super Admin and any Project Manager role can create projects.
    // Client Admins (Program Managers) focus on programs.
    return role === 'admin' || isAtLeastPM(role);
};

export const canCreateProgramme = (role?: UserRole) => {
    if (!role) return false;
    // Super Admin and Client Admin can create programmes
    return ['admin', 'client_admin'].includes(role);
};

export const canManageWorkspace = (role?: UserRole) => {
    return isAtLeastClientAdmin(role);
};

export const canViewExecutiveReports = (role?: UserRole) => {
    return isAtLeastClientAdmin(role);
};

export const isClientAdmin = (role?: string) => {
    return role === 'client_admin';
};

export const isPM = (role?: string) => {
    return ['project_manager', 'senior_pm', 'senior_project_manager', 'assistant_project_manager', 'project_coordinator'].includes(role || '');
};
