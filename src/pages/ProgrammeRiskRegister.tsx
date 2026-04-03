import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router';
import { useStore, RiskItem } from '../store/useStore';
import { CATEGORIES, WORKSTREAMS, KRI_LIST, RISK_STATUSES, RISK_RESPONSES, APPETITES } from '../data/riskData';
import { isAtLeastClientAdmin } from '../lib/roles';
import { clsx } from 'clsx';
import { stripMarkdown } from '../lib/utils';
import { format, differenceInDays } from 'date-fns';
import { InfoTooltip } from '../components/InfoTooltip';
import { Trash2, Edit2, Wand2, Plus, Info, ShieldOff, AlertCircle, FileSpreadsheet, Download, ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { RiskModal } from '../components/RiskModal';
import { AIInquiryPopup } from '../components/AIInquiryPopup';
import * as XLSX from 'xlsx';

const EmptyState = ({ title }: { title: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2 opacity-60">
        <ShieldOff className="w-8 h-8" />
        <p className="text-xs font-medium">{title}</p>
    </div>
);

function rsScore(score: number) {
  if (!score || score <= 6) return 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm';
  if (score <= 14) return 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm';
  return 'bg-rose-50 text-rose-600 border-rose-200 shadow-sm font-black animate-pulse';
}

function rLabel(s: number) {
  if (!s || s <= 6) return { l: 'Low', c: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
  if (s <= 14) return { l: 'Medium', c: 'bg-amber-50 text-amber-600 border-amber-200' };
  return { l: 'High', c: 'bg-rose-50 text-rose-600 border-rose-200 font-bold' };
}

function fGBP(v?: number) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return '£' + Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function fDate(d?: string) {
    if (!d) return '—';
    try { return format(new Date(d), 'dd MMM yy'); } catch { return d; }
}

function StatusBadge({ status }: { status: string }) {
    const cls =
        status === 'Open' ? 'bg-red-50 text-red-600 border-red-200' :
            status === 'Closed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                status === 'Mitigated' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                    status === 'Tolerated' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        'bg-slate-100 text-slate-600 border-slate-200';
    return <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold border', cls)}>{status}</span>;
}

export function ProgrammeRiskRegister() {
    const { risks, updateRisk, deleteRisk, addRisk, addRisks, programmes, projects, activeProgrammeId, user, addNotification } = useStore();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const fromInitiation = searchParams.get('from') === 'initiation';
    const userRole = user?.profile?.role;
    const isPM = !isAtLeastClientAdmin(userRole);
    const [filter, setFilter] = useState({
        programme: activeProgrammeId || '',
        status: '',
        category: '',
        search: ''
    });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRisk, setEditingRisk] = useState<RiskItem | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isAIInquiryOpen, setIsAIInquiryOpen] = useState(false);

    const canDelete = true;

    useEffect(() => {
        setSelectedIds([]);
    }, [activeProgrammeId, filter.programme, filter.status, filter.category]);

    const escalatedFromProjects = (Array.isArray(risks) ? risks : []).filter(r => r.escalated).map(r => ({ ...r, _source: 'project' as const }));
    const progRisks = (Array.isArray(risks) ? risks : []).filter(r => (r as any).isProgrammeLevel).map(r => ({ ...r, _source: 'programme' as const }));
    const allProg = [...escalatedFromProjects, ...progRisks];

    const filtered = allProg.filter(r => {
        if (filter.programme) {
            const matchesProj = r.projectId === filter.programme || r.project === filter.programme;
            const matchesProg = (r as any).programmeId === filter.programme || (r as any).programme === filter.programme;
            if (!matchesProj && !matchesProg) return false;
        }
        if (filter.status && r.status !== filter.status) return false;
        if (filter.category && r.category !== filter.category) return false;
        if (filter.search) {
            const q = filter.search.toLowerCase();
            if (!r.title?.toLowerCase().includes(q) && !r.id?.toLowerCase().includes(q)) return false;
        }
        return true;
    }).sort((a, b) => {
        const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
        const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.id || '').localeCompare(a.id || '');
    });

    const calcALE = (impact?: number, prob?: number) => {
        if (!impact || !prob) return 0;
        const p = prob > 1 ? prob / 100 : prob;
        return impact * p;
    };

    const totalGALE = filtered.reduce((s, r) => s + calcALE(r.grossImpact, r.grossProb), 0);
    const totalRALE = filtered.reduce((s, r) => s + calcALE(r.residualImpact, r.residualProb), 0);
    const pctReduction = totalGALE > 0 ? Math.round((1 - totalRALE / totalGALE) * 100) : 0;

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data: any[] = XLSX.utils.sheet_to_json(ws);

            const newRisks: RiskItem[] = data.map(row => ({
                id: `RSK-${Math.floor(Math.random() * 100000)}`,
                title: row.Title || 'Imported Risk',
                desc: row.Description || '',
                category: row.Category || 'Strategic',
                owner: row.Owner || '',
                project: '',
                workstream: row.Workstream || '',
                kri: '',
                cause: '',
                grossL: Number(row.Likelihood) || 3,
                grossI: Number(row.Impact) || 3,
                grossRating: (Number(row.Likelihood) || 3) * (Number(row.Impact) || 3),
                response: 'Treat',
                controls: '',
                residualL: Number(row.ResidualLikelihood) || 2,
                residualI: Number(row.ResidualImpact) || 2,
                residualRating: (Number(row.ResidualLikelihood) || 2) * (Number(row.ResidualImpact) || 2),
                appetite: 'Open',
                furtherAction: '',
                status: 'Open',
                dateAdded: new Date().toISOString(),
                dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
                escalated: false,
                grossImpact: 0,
                grossProb: 0,
                grossALE: 0,
                residualImpact: 0,
                residualProb: 0,
                residualALE: 0,
                riskReduction: 0,
                riskReductionPct: 0,
                programmeId: activeProgrammeId || '',
                isProgrammeLevel: true
            }));

            if (newRisks.length > 0) {
                addRisks(newRisks);
                addNotification({ title: 'Risks Imported', body: `Successfully imported ${newRisks.length} risks.`, type: 'risk' });
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const downloadCSVTemplate = () => {
        const headers = ["Title", "Description", "Category", "Owner", "Likelihood", "Impact", "ResidualLikelihood", "ResidualImpact", "Workstream"];
        const worksheet = XLSX.utils.json_to_sheet([headers.reduce((acc, h) => ({ ...acc, [h]: "" }), {})]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, "risk_import_template.xlsx");
    };

    const handleBulkDelete = () => {
        if (!canDelete || selectedIds.length === 0) return;
        if (window.confirm(`Are you sure you want to delete ${selectedIds.length} selected risks?`)) {
            selectedIds.forEach(id => deleteRisk(id));
            setSelectedIds([]);
            addNotification({ 
                title: 'Risks Deleted', 
                body: `Successfully deleted ${selectedIds.length} risks from the register.`, 
                type: 'risk' 
            });
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filtered.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filtered.map(r => r.id));
        }
    };

    const toggleSelectOne = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    return (
        <div className="max-w-[98%] mx-auto p-2 sm:p-4 lg:p-6 space-y-6 sm:space-y-8">
            {/* Unified Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-slate-200 animate-in fade-in slide-in-from-top-4 duration-1000">
                <div className="flex items-start gap-4">
                    {fromInitiation && (
                        <Link 
                            to={activeProgrammeId ? "/programmes/new" : "/initiate"}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-emerald-600 transition-all active:scale-95 animate-in fade-in slide-in-from-right-4 duration-700 mb-1"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Initiation Flow
                        </Link>
                    )}
                    <div className="space-y-1">
                        <h1 className="text-xl font-black text-slate-900 tracking-tight italic">
                            {isPM ? 'Shared Risk Portfolio' : 'Programme Risk Register'}
                        </h1>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">
                                Strategic Governance · Portfolio Oversight
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                        <input
                            type="file"
                            id="file-import"
                            className="hidden"
                            accept=".csv, .xlsx, .xls"
                            onChange={handleFileImport}
                        />
                        <button
                            onClick={() => document.getElementById('file-import')?.click()}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-50 border border-emerald-100 transition-all shadow-sm active:scale-95"
                            title="Import from Excel/CSV"
                        >
                            <FileSpreadsheet className="w-4 h-4" /> Import
                        </button>
                        <button
                            onClick={downloadCSVTemplate}
                            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all"
                            title="Download Template"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </div>

                    {isAtLeastClientAdmin(userRole) && (
                        <button
                            onClick={() => { useStore.getState().setActiveProgramme(null); navigate('/programmes/new'); }}
                            className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 border border-indigo-100 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-50 transition-all shadow-sm active:scale-95 ml-2"
                        >
                            <Plus className="w-4 h-4" />
                            New Programme
                        </button>
                    )}

                    <button
                        onClick={() => setIsAIInquiryOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 border border-indigo-100 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-50 transition-all shadow-sm active:scale-95 ml-2"
                    >
                        <Wand2 className="w-4 h-4" />
                        AI Risk Inquiry
                    </button>

                    <button onClick={() => { setEditingRisk(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 ml-2">
                        <Plus className="w-4 h-4" />
                        Identify New Risk
                    </button>
                </div>
            </div>

            {/* ─── NOTIFICATION BANNER ─── */}
            {escalatedFromProjects.length > 0 && (
                <div className="bg-indigo-900 text-white px-6 py-4 rounded-2xl shadow-lg flex items-center justify-between border border-indigo-700 ring-4 ring-indigo-900/10 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
                            <Plus className="w-6 h-6 text-indigo-300" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold tracking-tight">Project Risk Escalations Notification</h3>
                            <p className="text-[10px] text-white/70 font-medium mt-0.5 uppercase tracking-widest leading-relaxed">
                                {escalatedFromProjects.length} risks have been escalated to this programme from various projects.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Total', value: filtered.length, color: 'text-indigo-600', border: 'border-l-indigo-500' },
                    { label: 'Escalated (Project)', value: escalatedFromProjects.length, color: 'text-orange-600', border: 'border-l-orange-500' },
                    { label: isPM ? 'Shared Portfolio' : 'Programme Level', value: progRisks.length, color: 'text-purple-600', border: 'border-l-purple-500' },
                    { label: 'Open', value: filtered.filter(r => r.status === 'Open').length, color: 'text-red-600', border: 'border-l-red-500' },
                    { label: `${pctReduction}% Risk Reduction`, value: fGBP(Math.round(totalRALE)), color: 'text-slate-700', border: 'border-l-slate-400' },
                ].map(s => (
                    <div key={s.label} className={clsx('bg-white rounded-xl border border-slate-200 border-l-4 px-4 py-3 shadow-sm', s.border)}>
                        <div className={clsx('text-xl font-extrabold', s.color)}>{s.value}</div>
                        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-0.5">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <select value={filter.programme} onChange={e => setFilter({ ...filter, programme: e.target.value })}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-auto">
                    <option value="">All Programmes</option>
                    {(Array.isArray(programmes) ? programmes : []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-auto">
                    <option value="">All Status</option>
                    {RISK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-auto">
                    <option value="">All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="search" placeholder="Search programme risks..." value={filter.search}
                    onChange={e => setFilter({ ...filter, search: e.target.value })}
                    className="w-full sm:flex-1 min-w-[200px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
                <table className="w-full text-left text-[11px] border-collapse min-w-[1700px]">
                    <thead>
                        {/* Group headers */}
                        <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] h-12">
                            <th className="px-3 py-1 w-10 text-center sticky left-0 bg-slate-50 z-30 border-r border-slate-200" rowSpan={2}>
                                <input 
                                    type="checkbox" 
                                    className="rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 shadow-sm"
                                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="px-3 py-1" colSpan={8}></th>
                            <th className="px-3 py-1 text-center border-x border-slate-200/60 bg-red-50/50 text-red-700 font-black shadow-[inset_0_-2px_0_rgba(185,28,28,0.1)]" colSpan={3}>Gross Risk Rating</th>
                            <th className="px-3 py-1" colSpan={3}></th>
                            <th className="px-3 py-1 text-center border-x border-slate-200/60 bg-emerald-50/50 text-emerald-700 font-black shadow-[inset_0_-2px_0_rgba(5,150,105,0.1)]" colSpan={3}>Residual Risk Rating</th>
                            <th className="px-3 py-1" colSpan={4}></th>
                            <th className="px-3 py-1 text-center border-x border-slate-200/60 bg-blue-50/50 text-blue-700 font-black shadow-[inset_0_-2px_0_rgba(29,78,216,0.1)]" colSpan={3}>Gross ALE</th>
                            <th className="px-3 py-1 text-center border-x border-slate-200/60 bg-indigo-50/50 text-indigo-700 font-black shadow-[inset_0_-2px_0_rgba(67,56,202,0.1)]" colSpan={3}>Residual ALE</th>
                            <th className="px-3 py-1" colSpan={3}></th>
                        </tr>
                        <tr className="bg-slate-50/50 text-slate-500 uppercase tracking-[0.15em] border-b border-slate-200 text-[9px] font-black sticky top-12 z-20 backdrop-blur-md">
                            <th className="px-3 py-3 sticky left-10 bg-slate-50/90 border-r border-slate-100/60 z-30 whitespace-nowrap shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">Risk Ref</th>
                            <th className="px-3 py-3 whitespace-nowrap">Source</th>
                            <th className="px-3 py-3 whitespace-nowrap">Programme / Project</th>
                            <th className="px-3 py-3 whitespace-nowrap">Workstream</th>
                            <th className="px-3 py-3 whitespace-nowrap">Linked KRI</th>
                            <th className="px-3 py-3 whitespace-nowrap">Date Added</th>
                            <th className="px-3 py-3 min-w-[350px]">Risk Title & Description</th>
                            <th className="px-3 py-3 whitespace-nowrap">Risk Owner</th>
                            {/* Gross */}
                            <th className="px-2 py-3 text-center border-l border-slate-200/60 bg-red-50/20 font-black">I</th>
                            <th className="px-2 py-3 text-center bg-red-50/20 font-black">L</th>
                            <th className="px-2 py-3 text-center border-r border-slate-200/60 bg-red-50/20 font-black">Rating</th>
                            {/* Post Gross */}
                            <th className="px-3 py-3 whitespace-nowrap">Response</th>
                            <th className="px-3 py-3 whitespace-nowrap">Controls (Mitigation)</th>
                            <th className="px-3 py-3 whitespace-nowrap">Control Owner</th>
                            {/* Residual */}
                            <th className="px-2 py-3 text-center border-l border-slate-200/60 bg-emerald-50/20 font-black">I</th>
                            <th className="px-2 py-3 text-center bg-emerald-50/20 font-black">L</th>
                            <th className="px-2 py-3 text-center border-r border-slate-200/60 bg-emerald-50/20 font-black">Rating</th>
                            {/* Post Current */}
                            <th className="px-3 py-3 whitespace-nowrap">Appetite</th>
                            <th className="px-3 py-3 min-w-[150px]">Risk Review Plan</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center">Status</th>
                            <th className="px-3 py-3 whitespace-nowrap">Last Review</th>
                            {/* ALE */}
                            <th className="px-3 py-3 text-right border-l border-slate-200/60 bg-blue-50/20 whitespace-nowrap font-black">Impact</th>
                            <th className="px-3 py-3 text-center bg-blue-50/20 whitespace-nowrap font-black">Prob</th>
                            <th className="px-3 py-3 text-right border-r border-slate-200/60 bg-blue-50/20 whitespace-nowrap font-black">ALE</th>
                            <th className="px-3 py-3 text-right border-l border-slate-200/60 bg-indigo-50/20 whitespace-nowrap font-black">Impact</th>
                            <th className="px-3 py-3 text-center bg-indigo-50/20 whitespace-nowrap font-black">Prob</th>
                            <th className="px-3 py-3 text-right border-r border-slate-200/60 bg-indigo-50/20 whitespace-nowrap font-black">ALE</th>
                            {/* Tail */}
                            <th className="px-3 py-3 text-right whitespace-nowrap font-black">Reduction</th>
                            <th className="px-3 py-3 text-center whitespace-nowrap font-black">Red%</th>
                            <th className="px-3 py-3 text-center whitespace-nowrap sticky right-0 bg-slate-50 border-l border-slate-200 z-30 font-black shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map(r => {
                            const isEsc = (r as any)._source === 'project';
                            const projectName = (Array.isArray(projects) ? projects : []).find(p => p.id === r.projectId)?.name;
                            const progName = (Array.isArray(programmes) ? programmes : []).find(p => p.id === r.programmeId)?.name;
                            const displayContext = projectName || progName || '—';

                            const c = rLabel(r.residualRating);
                            const gALE = calcALE(r.grossImpact, r.grossProb);
                            const rALE = calcALE(r.residualImpact, r.residualProb);
                            const reduction = gALE - rALE;
                            const redPct = r.grossRating > 0 ? Math.round((1 - r.residualRating / r.grossRating) * 100) : 0;

                            return (
                                <tr key={r.id} className={clsx('hover:bg-slate-50/80 transition-all group border-b border-slate-100 items-center', isEsc ? 'bg-orange-50/30' : 'bg-purple-50/10', selectedIds.includes(r.id) && 'bg-indigo-50/40')}>
                                    <td className="px-3 py-3 text-center sticky left-0 bg-white group-hover:bg-slate-50 z-20 border-r border-slate-100 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 shadow-sm transition-all group-hover:scale-110"
                                            checked={selectedIds.includes(r.id)}
                                            onChange={() => toggleSelectOne(r.id)}
                                        />
                                    </td>
                                    <td className="px-3 py-3 font-black text-indigo-600 cursor-pointer hover:text-indigo-800 hover:underline sticky left-10 bg-white group-hover:bg-slate-50 z-20 border-r border-slate-100 transition-colors whitespace-nowrap" onClick={() => { setEditingRisk(r); setIsModalOpen(true); }}>{r.id}</td>
                                    <td className="px-3 py-3 whitespace-nowrap">
                                        {isEsc
                                            ? <span className="px-2 py-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-[9px] font-black uppercase tracking-wider">↑ Project</span>
                                            : <span className="px-2 py-1 bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[9px] font-black uppercase tracking-wider">Programme</span>
                                        }
                                    </td>
                                    <td className="px-3 py-3 text-slate-600 max-w-[150px] truncate whitespace-nowrap font-medium" title={displayContext}>{displayContext}</td>
                                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap font-medium">{r.workstream || '—'}</td>
                                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap font-medium">{r.kri || '—'}</td>
                                    <td className="px-3 py-3 text-slate-400 whitespace-nowrap font-medium">{fDate(r.dateAdded)}</td>
                                    <td className="px-3 py-3 font-medium text-slate-800 min-w-[350px] whitespace-normal leading-relaxed">
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center flex-wrap gap-2">
                                              <span className="font-black text-slate-900 text-[12px] tracking-tight">{r.title}</span>
                                              {differenceInDays(new Date(), new Date(r.dateAdded || '')) < 1 && (
                                                  <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[7px] font-black uppercase rounded shadow-sm animate-pulse shrink-0">New</span>
                                              )}
                                          </div>
                                          <span className="text-[10px] text-slate-500 italic font-normal line-clamp-2 max-w-[400px] leading-relaxed" title={stripMarkdown(r.desc || '')}>{stripMarkdown(r.desc || '')}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap font-medium">{r.owner || '—'}</td>

                                    {/* Gross */}
                                    <td className="px-2 py-3 text-center border-l border-slate-100 bg-red-50/20"><span className={clsx('inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black shadow-sm ring-1 ring-black/5', rsScore(r.grossRating))}>{r.grossI}</span></td>
                                    <td className="px-2 py-3 text-center bg-red-50/20"><span className={clsx('inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black shadow-sm ring-1 ring-black/5', rsScore(r.grossRating))}>{r.grossL}</span></td>
                                    <td className="px-2 py-3 text-center border-r border-slate-100 bg-red-50/20"><span className={clsx('inline-flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-black shadow-md ring-1 ring-black/5', rsScore(r.grossRating))}>{r.grossRating}</span></td>

                                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap italic font-medium">{r.response || '—'}</td>
                                    <td className="px-3 py-3 text-slate-500 max-w-[150px] truncate whitespace-nowrap font-medium" title={r.controls}>{r.controls?.split('\n')[0] || '—'}</td>
                                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap font-medium">{(r as any).controlOwner || r.owner || '—'}</td>

                                    {/* Residual */}
                                    <td className="px-2 py-3 text-center border-l border-slate-100 bg-emerald-50/20"><span className={clsx('inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black shadow-sm ring-1 ring-black/5', rsScore(r.residualRating))}>{r.residualI}</span></td>
                                    <td className="px-2 py-3 text-center bg-emerald-50/20"><span className={clsx('inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black shadow-sm ring-1 ring-black/5', rsScore(r.residualRating))}>{r.residualL}</span></td>
                                    <td className="px-2 py-3 text-center border-r border-slate-100 bg-emerald-50/20"><span className={clsx('inline-flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-black shadow-md ring-1 ring-black/5', rsScore(r.residualRating))}>{r.residualRating}</span></td>

                                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap font-black text-[10px] uppercase tracking-wider">{r.appetite || '—'}</td>
                                    <td className="px-3 py-3 text-slate-500 min-w-[150px] whitespace-normal leading-relaxed text-[10px] font-medium">{stripMarkdown(r.furtherAction) || '—'}</td>
                                    <td className="px-3 py-3 whitespace-nowrap text-center"><StatusBadge status={r.status} /></td>
                                    <td className="px-3 py-3 text-slate-400 whitespace-nowrap font-medium">{fDate((r as any).lastReviewDate)}</td>

                                    {/* Gross ALE */}
                                    <td className="px-3 py-3 text-right border-l border-slate-100 text-slate-600 whitespace-nowrap font-bold">{fGBP(r.grossImpact)}</td>
                                    <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap font-bold">{r.grossProb ? Math.round(r.grossProb * 100) + '%' : '—'}</td>
                                    <td className="px-3 py-3 text-right border-r border-slate-100 font-black text-slate-900 whitespace-nowrap">{fGBP(Math.round(gALE))}</td>

                                    {/* Residual ALE */}
                                    <td className="px-3 py-3 text-right border-l border-slate-100 text-slate-600 whitespace-nowrap font-bold">{fGBP(r.residualImpact)}</td>
                                    <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap font-bold">{r.residualProb ? Math.round(r.residualProb * 100) + '%' : '—'}</td>
                                    <td className="px-3 py-3 text-right border-r border-slate-100 font-black text-indigo-700 whitespace-nowrap">{fGBP(Math.round(rALE))}</td>

                                    <td className="px-3 py-3 text-right font-black text-emerald-600 whitespace-nowrap text-[12px]">{reduction > 0 ? fGBP(Math.round(reduction)) : '—'}</td>
                                    <td className="px-3 py-3 text-center font-black text-emerald-600 whitespace-nowrap text-[12px]">{redPct > 0 ? redPct + '%' : '—'}</td>

                                    <td className="px-3 py-3 sticky right-0 bg-white group-hover:bg-slate-50 z-20 border-l border-slate-100 transition-colors shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                                         <div className="flex items-center gap-1.5">
                                             <button onClick={() => { setEditingRisk(r); setIsModalOpen(true); }}
                                                 className="w-8 h-8 flex items-center justify-center bg-white text-slate-400 border border-slate-200 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm active:scale-90" title="Edit">
                                                 <Edit2 className="w-3.5 h-3.5" />
                                             </button>
                                             {isEsc && (
                                                 <button onClick={() => updateRisk(r.id, { escalated: false })}
                                                     className="px-2.5 py-1.5 bg-white text-slate-500 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300 transition-all shadow-sm active:scale-90 whitespace-nowrap"
                                                     title="De-escalate">De-esc</button>
                                             )}
                                             {!r.convertedToIssue && r.status !== 'Closed' && (
                                                 <button onClick={() => {
                                                     if (window.confirm(`Convert risk ${r.id} to an issue? This will close the risk.`)) {
                                                         useStore.getState().convertToIssue(r.id);
                                                     }
                                                 }}
                                                 className="w-8 h-8 flex items-center justify-center bg-white text-amber-500 border border-amber-200 rounded-xl hover:bg-amber-50 hover:border-amber-300 transition-all shadow-sm active:scale-90" title="Move to Issue">
                                                     <AlertTriangle className="w-3.5 h-3.5" />
                                                 </button>
                                             )}
                                             <button onClick={() => { if (window.confirm('Delete this risk?')) deleteRisk(r.id); }}
                                                 className="w-8 h-8 flex items-center justify-center bg-white text-slate-400 border border-slate-200 rounded-xl hover:text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-all shadow-sm active:scale-90" title="Delete">
                                                 <Trash2 className="w-3.5 h-3.5" />
                                             </button>
                                         </div>
                                     </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {/* ALE Summary Footer */}
                    {filtered.length > 0 && (
                        <tfoot className="bg-slate-50/80 backdrop-blur-md border-t-2 border-slate-200">
                            <tr className="h-14">
                                <td className="px-4"></td>
                                <td colSpan={21} className="px-4 text-right font-black text-[11px] text-slate-500 uppercase tracking-[0.2em]">Portfolio Aggregate Totals</td>
                                <td className="px-4 text-right font-black text-slate-900 border-l border-slate-200 bg-slate-100/30">{fGBP(Math.round(totalGALE))}</td>
                                <td colSpan={2} />
                                <td className="px-4 text-right font-black text-indigo-700 border-l border-slate-200 bg-indigo-50/30">{fGBP(Math.round(totalRALE))}</td>
                                <td colSpan={2} />
                                <td className="px-4 text-right font-black text-emerald-700 bg-emerald-50/30">{fGBP(Math.round(totalGALE - totalRALE))}</td>
                                <td className="px-4 text-center font-black text-emerald-700 bg-emerald-50/30">{pctReduction}%</td>
                                <td />
                            </tr>
                        </tfoot>
                    )}
                </table>
                {filtered.length === 0 && (
                    <EmptyState title="No programme risks found. Escalated project risks will appear here automatically." />
                )}
            </div>

            <RiskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={(d) => {
                    if (editingRisk) {
                        updateRisk(editingRisk.id, d);
                    } else {
                        const newRisk: RiskItem = {
                            ...d,
                            id: `R-PROG-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
                            dateAdded: new Date().toISOString().split('T')[0]
                        } as RiskItem;
                        addRisk(newRisk);
                    }
                }}
                initialData={editingRisk}
            />

            {/* AI Inquiry Assistant */}
            <AIInquiryPopup 
                isOpen={isAIInquiryOpen} 
                onClose={() => setIsAIInquiryOpen(false)} 
                context="Programme Risk Register"
            />

            {/* Floating AI Trigger */}
            <button
                onClick={() => setIsAIInquiryOpen(true)}
                className="fixed bottom-8 right-8 z-[150] bg-indigo-600 text-white p-4 rounded-full shadow-2xl shadow-indigo-500/40 hover:bg-slate-900 transition-all hover:scale-110 active:scale-95 group"
                title="Consult CedarGuard AI"
            >
                <Wand2 className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            </button>
        </div>
    );
}
