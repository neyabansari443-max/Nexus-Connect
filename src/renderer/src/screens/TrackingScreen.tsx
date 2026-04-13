import React, { useState, useEffect } from 'react';
import { Activity, Clock, FileText, CheckCircle2, AlertCircle, Loader2, RefreshCcw, FileDown, MessageCircle } from 'lucide-react';
import { useCampaignStore } from '../store/useCampaignStore';

interface CampaignLog {
  date: string;
  leadName: string;
  targetPhone: string;
  messagePreview: string;
  status: 'Sent' | 'Failed/Invalid' | 'Invalid Number' | 'Pending' | 'Replied';
}

export default function TrackingScreen() {
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [loading, setLoading] = useState(true);
  const isEngineRunning = useCampaignStore((state) => state.isEngineRunning);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (window.api && window.api.storeGet) {
        const data = await window.api.storeGet('campaignLogs');
        if (Array.isArray(data)) {
          setLogs(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch campaign logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    
    // Auto-refresh every 5 seconds if left open
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000);

    let unsubRefresh: (() => void) | undefined;
    if (window.api && window.api.onForceLogsRefresh) {
      unsubRefresh = window.api.onForceLogsRefresh(() => {
         fetchLogs();
      });
    }

    return () => {
      clearInterval(interval);
      if (unsubRefresh) unsubRefresh();
    };
  }, []);

  const exportToCSV = () => {
    if (logs.length === 0) return;
    
    const headers = ['Date', 'Lead Name', 'Target Phone', 'Message Preview', 'Status'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => 
        [
          new Date(log.date).toLocaleString(), 
          `"${log.leadName}"`, 
          log.targetPhone, 
          `"${log.messagePreview.replace(/"/g, '""')}"`, 
          log.status
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Campaign_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sentCount = logs.filter(log => log.status === 'Sent' || log.status === 'Replied').length;
  const invalidCount = logs.filter(log => log.status === 'Invalid Number' || log.status === 'Failed/Invalid').length;
  const pendingCount = logs.filter(log => log.status === 'Pending').length;
  const repliedCount = logs.filter(log => log.status === 'Replied').length;
  const totalProcessed = logs.length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 grid place-items-center">
            <Activity className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Campaign Tracking</h1>
            <p className="text-sm text-zinc-400">Monitor real-time message delivery and queue status.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchLogs} 
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors border border-zinc-800"
          >
            <RefreshCcw className="w-4 h-4 text-zinc-400" />
            Refresh
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-1">Total Processed</h3>
          <div className="text-3xl font-bold text-white mb-1">{totalProcessed}</div>
          <p className="text-xs text-zinc-500">Leads initiated</p>
        </div>
        
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-1">Messages Sent</h3>
          <div className="text-3xl font-bold text-emerald-500 mb-1">{sentCount}</div>
          <p className="text-xs text-zinc-500">Successfully delivered</p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-1">Invalid Numbers</h3>
          <div className="text-3xl font-bold text-rose-500 mb-1">{invalidCount}</div>
          <p className="text-xs text-zinc-500">Skipped or failed</p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-medium text-zinc-400 mb-1">Pending in Queue</h3>
          <div className="text-3xl font-bold text-amber-500 mb-1">{pendingCount}</div>
          <p className="text-xs text-zinc-500">Awaiting dispatch</p>
        </div>

        <div className="bg-zinc-950 border border-indigo-500/30 rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-20"><MessageCircle className="w-12 h-12 text-indigo-400" /></div>
          <h3 className="text-sm font-medium text-indigo-300 mb-1 relative z-10">Replies Detected</h3>
          <div className="text-3xl font-bold text-indigo-400 mb-1 relative z-10">{repliedCount}</div>
          <p className="text-xs text-indigo-500/70 relative z-10">Automated listening active</p>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Detailed Data Table</h3>
          {isEngineRunning && (
            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-full text-xs font-medium animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Engine Active
            </div>
          )}
        </div>
        
        {logs.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 grid place-items-center mb-4">
              <FileText className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-300 font-medium">{loading ? 'Loading records...' : 'No campaign records found'}</p>
            <p className="text-zinc-500 text-sm mt-1 max-w-sm">When you run your first automation engine sequence in the Campaigns tab, detailed logs will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/40 text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                  <th className="px-6 py-4">Date / Time</th>
                  <th className="px-6 py-4">Lead Name</th>
                  <th className="px-6 py-4">Target Phone</th>
                  <th className="px-6 py-4 w-1/3">Message Preview</th>
                  <th className="px-6 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 bg-zinc-950/50">
                {logs.slice().reverse().map((log, index) => (
                  <tr key={index} className="hover:bg-zinc-900/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <Clock className="w-4 h-4 text-zinc-600" />
                        <span className="text-xs">{new Date(log.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-zinc-200">
                      {log.leadName}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 font-mono text-xs">
                      {log.targetPhone}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-zinc-500 line-clamp-2" title={log.messagePreview}>
                        {log.messagePreview}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {log.status === 'Sent' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sent
                        </div>
                      )}
                      {(log.status === 'Invalid Number' || log.status === 'Failed/Invalid') && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {log.status}
                        </div>
                      )}
                      {log.status === 'Pending' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Pending
                        </div>
                      )}
                      {log.status === 'Replied' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
                          <MessageCircle className="w-3.5 h-3.5" />
                          Replied
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}