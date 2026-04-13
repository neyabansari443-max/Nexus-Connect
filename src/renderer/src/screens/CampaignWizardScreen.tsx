import React, { useState, useEffect } from 'react';
import { Send, UploadCloud, FileText, CheckCircle2, ChevronDown, ShieldCheck } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase';
import { usePlan } from '../features/subscription/plan';
import ActionDialog from '../components/ActionDialog';

const BILLING_URL = 'https://nexuslead.live/dashboard/billing';

export default function CampaignWizardScreen() {
  const { userId } = useAuth();
  const { isPro } = usePlan();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Leads for the selected category
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [invalidLeadIds, setInvalidLeadIds] = useState<string[]>([]);

  const [template, setTemplate] = useState('{Hey|Hi|Hello} {name},\n\nWe saw your business profile and thought you might be interested in scaling your operations.\n\n{Can we share more details?|Would you like a quick walkthrough?|Can I send you a short plan?}');

  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [showInvalidLeadDialog, setShowInvalidLeadDialog] = useState(false);
  const [pendingLeads, setPendingLeads] = useState<any[]>([]);
  const [pendingInvalidCount, setPendingInvalidCount] = useState(0);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [noticeDialog, setNoticeDialog] = useState({
    open: false,
    title: '',
    description: ''
  });

  useEffect(() => {
    if (window.api && window.api.storeGet) {
      window.api.storeGet('whatsappAccounts').then((val) => {
        if (Array.isArray(val)) setAccounts(val);
      });
      window.api.storeGet('activeAccountId').then((val) => {
        if (typeof val === 'string') setSelectedAccountId(val);
      });
      window.api.storeGet('invalidLeadIds').then((val) => {
        if (Array.isArray(val)) setInvalidLeadIds(val);
      });
    }
  }, []);

  useEffect(() => {
    async function fetchCategories() {
      setLoadingCategories(true);
      if (userId) {
        const { data, error } = await supabase
          .from('leads')
          .select('category')
          .eq('user_id', userId);
        
        if (!error && data) {
          const uniqueCategories = Array.from(new Set(data.map(item => item.category).filter(Boolean)));
          setCategories(uniqueCategories);
        }
      }
      setLoadingCategories(false);
    }
    fetchCategories();
  }, [userId]);

  useEffect(() => {
    async function fetchLeadsForCategory() {
      if (!selectedCategory || !userId) {
        setLeads([]);
        return;
      }
      
      setLoadingLeads(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .eq('category', selectedCategory)
        .not('phone', 'is', null)
        .neq('phone', 'N/A')
        .neq('phone', '');

      if (!error && data) {
        setLeads(data.map(lead => ({ ...lead, checked: true })));
      } else {
        setLeads([]);
      }
      setLoadingLeads(false);
    }
    
    fetchLeadsForCategory();
  }, [selectedCategory, userId]);

  const handleToggleLead = (id: string) => {
    setLeads(prev => prev.map(lead => lead.id === id ? { ...lead, checked: !lead.checked } : lead));
  };

  const handleInvertSelection = () => {
    setLeads(prev => prev.map(lead => ({ ...lead, checked: !lead.checked })));
  };

  const startCampaign = (checkedLeads: any[]) => {
    if (window.api && window.api.startSending) {
      // Save active explicitly before starting so backend reads correct folder
      window.api.storeSet('activeAccountId', selectedAccountId).then(() => {
        window.api.startSending({ leads: checkedLeads, template, userId });
        setStep(4);
      });
    } else {
      console.warn("API not bound: Cannot send trigger to Electron main process");
    }
  };

  const openNotice = (title: string, description: string) => {
    setNoticeDialog({ open: true, title, description });
  };

  const closeNotice = () => {
    setNoticeDialog((previous) => ({ ...previous, open: false }));
  };

  const openBillingPortal = () => {
    if (window.api?.openAuthUrl) {
      void window.api.openAuthUrl(BILLING_URL);
    } else {
      window.open(BILLING_URL, '_blank', 'noopener,noreferrer');
    }
  };

  const handleIncludeInvalidLeads = () => {
    setShowInvalidLeadDialog(false);

    if (pendingLeads.length === 0) {
      return;
    }

    const leadsToSend = [...pendingLeads];
    setPendingLeads([]);
    setPendingInvalidCount(0);
    startCampaign(leadsToSend);
  };

  const handleSkipInvalidLeads = () => {
    const filteredLeads = pendingLeads.filter((lead) => !invalidLeadIds.includes(String(lead.id)));

    setShowInvalidLeadDialog(false);
    setPendingLeads([]);
    setPendingInvalidCount(0);

    if (filteredLeads.length === 0) {
      openNotice('No Leads Left', 'All selected leads were marked invalid, so there are no leads left to send in this run.');
      return;
    }

    startCampaign(filteredLeads);
  };

  const handleStartSending = () => {
    if (!isPro) {
      setShowUpgradeDialog(true);
      return;
    }

    if (!userId) {
      openNotice('Authentication Required', 'Your session is missing. Please sign in again and retry.');
      return;
    }

    const checkedLeads = leads.filter(l => l.checked);
    if (!selectedAccountId) {
      openNotice('Sender Account Required', 'Please select a WhatsApp sender account before launching the campaign.');
      return;
    }

    const selectedInvalidCount = checkedLeads.filter((lead) => invalidLeadIds.includes(String(lead.id))).length;
    if (selectedInvalidCount > 0) {
      setPendingLeads(checkedLeads);
      setPendingInvalidCount(selectedInvalidCount);
      setShowInvalidLeadDialog(true);
      return;
    }

    startCampaign(checkedLeads);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in mt-6">
      <div className="flex justify-between items-center bg-[#121214] p-4 rounded-xl border border-zinc-800">
        <StepIndicator active={step >= 1} number={1} title="Select Leads" icon={<UploadCloud size={16} />} />
        <StepIndicator active={step >= 2} number={2} title="Compose Message" icon={<FileText size={16} />} />
        <StepIndicator active={step >= 3} number={3} title="Launch Engine" icon={<CheckCircle2 size={16} />} />
      </div>

      <div className="bg-[#121214] border border-zinc-800 rounded-xl p-8 shadow-xl min-h-[400px]">
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold mb-4 text-white">Select a Lead Category</h2>
            {loadingCategories ? (
              <p className="text-zinc-500">Loading categories from Supabase...</p>
            ) : categories.length === 0 ? (
              <p className="text-zinc-500">No saved leads found. Please extract leads first.</p>
            ) : (
              <select
                className="w-full bg-[#0a0a0b] border border-zinc-700 rounded-lg p-4 text-white hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="" disabled>Select a saved category from Supabase...</option>
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}

            {selectedCategory && (
              <div className="mt-6">
                <div className="flex justify-between items-end mb-3">
                  <h3 className="text-lg font-medium text-white">Filter Audience ({leads.filter(l => l.checked).length} selected)</h3>
                  <button 
                    onClick={handleInvertSelection} 
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition underline underline-offset-2"
                  >
                    Invert Selection
                  </button>
                </div>
                {loadingLeads ? (
                   <p className="text-zinc-500 text-sm">Fetching leads...</p>
                ) : leads.length === 0 ? (
                   <p className="text-zinc-500 text-sm">No phone numbers found for this category.</p>
                ) : (
                  <div className="bg-[#0a0a0b] border border-zinc-700 rounded-lg max-h-64 overflow-y-auto">
                    <ul className="divide-y divide-zinc-800">
                      {leads.map((lead) => (
                        <li key={lead.id} className="p-3 flex items-center hover:bg-zinc-800/50 transition">
                          <input 
                            type="checkbox" 
                            id={`lead-${lead.id}`}
                            checked={lead.checked} 
                            onChange={() => handleToggleLead(lead.id)}
                            className="h-4 w-4 rounded border-zinc-600 text-indigo-500 focus:ring-indigo-600 bg-zinc-900"
                          />
                          <label htmlFor={`lead-${lead.id}`} className="ml-3 flex flex-col flex-1 cursor-pointer">
                            <span className="text-sm font-medium text-white">{lead.business_name || lead.name || 'Unknown Business'}</span>
                            <span className="text-xs text-zinc-400">{lead.phone}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="pt-8 text-right">
              <button
                onClick={() => setStep(2)}
                disabled={!selectedCategory || leads.filter(l => l.checked).length === 0}
                className="bg-white text-black px-6 py-2.5 rounded-lg font-medium hover:bg-zinc-200 disabled:opacity-50 transition"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 flex flex-col h-full">
            <h2 className="text-2xl font-semibold text-white">Message Template Editor</h2>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-2">
              <p className="text-sm text-emerald-200 font-medium">Personalization & Text Spinning</p>
              <p className="text-xs text-emerald-100/90 leading-relaxed">
                Repetitive copy-paste text can hurt deliverability. Use variables and spintax so every message is naturally different.
                Example: {'{Hey|Hi|Hello}'} {'{name}'}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => setTemplate(prev => prev + '{name}')} className="px-3 py-1 rounded-full border border-indigo-500/50 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition">+ {'{name}'}</button>
              <button onClick={() => setTemplate(prev => prev + '{business_name}')} className="px-3 py-1 rounded-full border border-indigo-500/50 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition">+ {'{business_name}'}</button>
              <button onClick={() => setTemplate(prev => prev + '{city}')} className="px-3 py-1 rounded-full border border-indigo-500/50 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition">+ {'{city}'}</button>
              <button onClick={() => setTemplate(prev => prev + '{my_name}')} className="px-3 py-1 rounded-full border border-indigo-500/50 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition">+ {'{my_name}'}</button>
              <button onClick={() => setTemplate(prev => prev + '{Hey|Hi|Hello}')} className="px-3 py-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition">+ {'{Hey|Hi|Hello}'}</button>
            </div>
            <div className="text-xs text-zinc-400 leading-relaxed bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
              <p>{'{name}'}: lead name (or business name fallback)</p>
              <p>{'{business_name}'}: business_name</p>
              <p>{'{city}'}: city (if missing, fallback "your area")</p>
              <p>{'{my_name}'}: Settings se saved sender name (fallback "Nexus Connect")</p>
            </div>
            <textarea
              className="flex-1 w-full bg-[#0a0a0b] border border-zinc-700 rounded-lg p-4 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-sm leading-relaxed"
              rows={8}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Type your message here..."
            />
            <div className="pt-4 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="text-zinc-400 px-6 py-2.5 hover:text-white transition"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="bg-white text-black px-6 py-2.5 rounded-lg font-medium hover:bg-zinc-200 transition"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8 flex flex-col items-center justify-center text-center h-full py-12">
            <h2 className="text-3xl font-bold text-white mb-2">Ready to Launch</h2>
            <p className="text-zinc-400 max-w-sm mb-6">Select the engine endpoint and launch the campaign to your selected leads.</p>
            
            <div className="w-full max-w-md mb-6 text-left">
              <label className="block text-sm font-medium text-zinc-400 mb-2">Select Sender Account</label>
              <div className="relative">
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-zinc-700 rounded-lg p-3.5 pr-10 text-white appearance-none hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-sm"
                >
                  <option value="" disabled>Choose a WhatsApp account...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} {acc.number ? `(${acc.number})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              </div>

              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-300" />
                <p className="text-sm text-muted-foreground text-zinc-400 leading-relaxed">
                  End-to-End Local Execution. We do not track, read, or sync your WhatsApp messages or lead numbers to any cloud server.
                </p>
              </div>
            </div>

            <button
              onClick={handleStartSending}
              disabled={!selectedAccountId}
              className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 hover:bg-indigo-500 shadow-[0_0_40px_rgba(79,70,229,0.4)] disabled:shadow-none"
            >
              <Send className="mr-2 h-5 w-5 group-hover:translate-x-1 group-disabled:translate-x-0 transition-transform" />
              Start Sending Engine
            </button>
            <div className="pt-4">
              <button onClick={() => setStep(2)} className="text-zinc-500 hover:text-white transition text-sm">
                 Edit Configuration
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center justify-center h-full space-y-4 py-16">
            <CheckCircle2 className="w-16 h-16 text-indigo-500 animate-pulse" />
            <h2 className="text-2xl font-bold text-white">Engine Started</h2>
            <p className="text-zinc-400">Check the terminal below for live logs. You can stop the engine from the sidebar.</p>
          </div>
        )}
      </div>

      <ActionDialog
        open={showInvalidLeadDialog}
        tone="warning"
        title="Invalid Leads Detected"
        description={`${pendingInvalidCount} selected leads were marked invalid in previous runs. You can still continue with all leads or skip those numbers for this run.`}
        confirmLabel="Send All"
        cancelLabel="Skip Invalid"
        onConfirm={handleIncludeInvalidLeads}
        onCancel={handleSkipInvalidLeads}
      />

      <ActionDialog
        open={showUpgradeDialog}
        tone="warning"
        title="Pro Plan Required"
        description="Campaign engine access is available only on Pro plan. Upgrade now to continue."
        confirmLabel="Open Billing"
        cancelLabel="Not Now"
        onConfirm={() => {
          setShowUpgradeDialog(false);
          openBillingPortal();
        }}
        onCancel={() => setShowUpgradeDialog(false)}
      />

      <ActionDialog
        open={noticeDialog.open}
        tone="warning"
        title={noticeDialog.title}
        description={noticeDialog.description}
        confirmLabel="Got it"
        showCancel={false}
        onConfirm={closeNotice}
        onCancel={closeNotice}
      />
    </div>
  );
}

function StepIndicator({ active, number, title, icon }) {
  return (
    <div className={`flex items-center space-x-3 ${active ? 'text-indigo-400' : 'text-zinc-600'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${active ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800'}`}>
        {number}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
      </div>
    </div>
  );
}