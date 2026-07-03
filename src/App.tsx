import { useState, useEffect } from 'react'
import { db } from './lib/supabase'
import { sp } from './lib/theme'
import { setCurrency } from './lib/currency'
import { useData } from './hooks/useData'
import { useRecurring } from './hooks/useRecurring'
import { useGroup } from './hooks/useGroup'
import { useOfflineSync } from './hooks/useOfflineSync'
import { useTheme } from './hooks/useTheme'
import { useBudgets } from './hooks/useBudgets'
import { useGoals } from './hooks/useGoals'
import { useMerchantRules } from './hooks/useMerchantRules'
import { useBreakpoint } from './hooks/useBreakpoint'
import { OfflineBanner } from './components/OfflineBanner'
import { Nav } from './components/Nav'
import { Sidebar } from './components/Sidebar'
import { BudgetAlert } from './components/BudgetAlert'
import { RejectionAlert } from './components/RejectionAlert'
import { IOSBanner } from './components/IOSBanner'
import { HomeSkeleton } from './components/Skeleton'
import { PullToRefresh } from './components/PullToRefresh'
import { AuthScreen } from './screens/Auth'
import { Home } from './screens/Home'
import { Comptes } from './screens/Comptes'
import { Depenses } from './screens/Depenses'
import { Analyse } from './screens/Analyse'
import { Groupe } from './screens/Groupe'
import { Settings } from './screens/Reglages'
import { ExpEntry } from './screens/modals/ExpEntry'
import { EditBudget } from './screens/modals/EditBudget'
import { EditAccount } from './screens/modals/EditAccount'
import { TransferEntry } from './screens/modals/TransferEntry'
import { RecurringManager } from './screens/modals/RecurringManager'
import { BudgetsScreen } from './screens/modals/BudgetsScreen'
import { GoalsScreen } from './screens/modals/GoalsScreen'
import { RulesScreen } from './screens/modals/RulesScreen'
import { MonthlyReport } from './screens/modals/MonthlyReport'
import { SearchScreen } from './screens/modals/SearchScreen'
import { ResetModal } from './screens/modals/ResetModal'
import { LockScreen } from './screens/modals/LockScreen'
import { PinSetup } from './screens/modals/PinSetup'
import { BankPicker } from './screens/modals/BankPicker'
import { ImportUniversal } from './screens/modals/ImportUniversal'
import { SUPPORTED_BANKS } from './lib/parsers/index'
import { ProfileScreen } from './screens/modals/ProfileScreen'
import { DepositModal } from './screens/modals/DepositModal'
import type { Profile } from './types'
import type { Session } from '@supabase/supabase-js'

// StatusBar is intentionally a no-op in the web PWA
const StatusBar = (_props: { t: unknown }) => null;

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState('accueil');
  const [showEntry, setShowEntry] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [editAccount, setEditAccount] = useState<unknown>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importBank, setImportBank] = useState<string | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [rtConnected, setRtConnected] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showBudgets, setShowBudgets] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [depositAccount, setDepositAccount] = useState<import('./types').Account | null>(null);
  const [locked, setLocked] = useState(() => localStorage.getItem('qdq-pin-enabled') === '1');
  const [profile, setProfile] = useState<Profile>(() => {
    try { return JSON.parse(localStorage.getItem('qdq-profile') || '{}') } catch { return {} }
  });
  const { t, mode: themeMode, setMode: setThemeMode } = useTheme();
  const { isDesktop } = useBreakpoint();

  useEffect(() => {
    db.auth.getSession().then(r => setSession(r.data.session));
    const { data: { subscription } } = db.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Apply saved currency on startup
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('qdq-profile') || '{}');
    if (saved.currency) {
      const cur = [
        { code: 'EUR', sym: '€', pos: 'after' as const, dec: ',' },
        { code: 'USD', sym: '$', pos: 'before' as const, dec: '.' },
        { code: 'GBP', sym: '£', pos: 'before' as const, dec: '.' },
        { code: 'XOF', sym: 'FCFA', pos: 'after' as const, dec: ',' },
        { code: 'CHF', sym: 'CHF', pos: 'after' as const, dec: '.' },
        { code: 'CAD', sym: 'CA$', pos: 'before' as const, dec: '.' },
        { code: 'MAD', sym: 'DH', pos: 'after' as const, dec: ',' },
        { code: 'TND', sym: 'DT', pos: 'after' as const, dec: ',' },
      ].find(c => c.code === saved.currency);
      if (cur) setCurrency(cur);
    }
  }, []);

  // Track realtime connection
  useEffect(() => {
    if (!session) return;
    const ch = db.channel('rt-status')
      .subscribe(s => setRtConnected(s === 'SUBSCRIBED'));
    return () => { db.removeChannel(ch); };
  }, [session]);

  // Auto-lock on background
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); }
      else if (hiddenAt && localStorage.getItem('qdq-pin-enabled') === '1') {
        const elapsed = (Date.now() - hiddenAt) / 60000;
        const threshold = parseFloat(localStorage.getItem('qdq-lock-after') || '1');
        if (elapsed >= threshold) setLocked(true);
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS && !(window.navigator as Navigator & { standalone?: boolean }).standalone && !localStorage.getItem('qdq-ios')) {
      setTimeout(() => setShowIOS(true), 3000);
    }
  }, []);

  const { data, loading, error, reload: reloadData, addTx, deleteTx, addTransfer, addDeposit } = useData(session ? session.user.id : null);
  const { isOnline, pendingCount, failedCount, isSyncing } = useOfflineSync(
    session ? session.user.id : null,
    reloadData
  );
  const { recurrings, allHistory, reload: reloadRec, addRecurring, deleteRecurring, updateRecurring } = useRecurring(session ? session.user.id : null);
  const { budgets, saveBudget, deleteBudget } = useBudgets(session ? session.user.id : null);
  const { goals, addGoal, deposit: depositGoal, deleteGoal } = useGoals(session ? session.user.id : null);
  const { rules: merchantRules, learnRule, deleteRule } = useMerchantRules(session ? session.user.id : null);
  const reload = () => { setAlertDismissed(false); reloadData(); };
  const { group, members, reload: reloadGroup, createGroup, joinGroup, leaveGroup } = useGroup(session ? session.user.id : null);

  const logout = async () => { await db.auth.signOut(); setTab('accueil'); };

  if (session === undefined) return (
    <div style={{ width: isDesktop ? '100%' : 375, minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 28, ...sp('s', 700), color: t.primary, letterSpacing: -1 }}>QDQ</div>
      <div style={{ width: 32, height: 32, border: '3px solid ' + t.primary + '33', borderTop: '3px solid ' + t.primary, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  );

  if (!session) return (<div style={{ width: isDesktop ? '100%' : 375, minHeight: '100vh', background: t.bg, display: 'flex', justifyContent: 'center' }}><div style={{ width: 375 }}><AuthScreen t={t} /></div></div>);

  const renderMain = () => {
    if (loading && !data) return <HomeSkeleton t={t} />;
    if (error) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>Erreur de chargement</div>
        <div style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{error}</div>
        <button onClick={reload} style={{ padding: '10px 20px', borderRadius: 12, background: t.mD, border: '1px solid ' + t.primary + '44', cursor: 'pointer', ...sp('o', 600), fontSize: 13, color: t.primary }}>Réessayer</button>
      </div>
    );
    if (!data) return null;
    if (tab === 'accueil') return (
      <PullToRefresh onRefresh={async () => { reload(); }} t={t}>
        <div>
          {!alertDismissed && <BudgetAlert D={data} t={t} threshold={parseInt(localStorage.getItem('qdq-alert-threshold') || '80')} onDismiss={() => setAlertDismissed(true)} />}
          <RejectionAlert t={t} accounts={data.accounts} recurrings={recurrings || []} onManage={() => setShowRecurring(true)} />
          <Home D={data} t={t} onAcc={() => setTab('comptes')} onAdd={() => setShowEntry(true)} onEditBudget={() => setEditBudget(true)} onDelete={deleteTx} rtConnected={rtConnected} profile={profile} onSearch={() => setShowSearch(true)} recurrings={recurrings || []} onManageRecurring={() => setShowRecurring(true)} onTransfer={() => setShowTransfer(true)} />
        </div>
      </PullToRefresh>
    );
    if (tab === 'depenses') return (
      <PullToRefresh onRefresh={async () => { reload(); }} t={t}>
        <Depenses D={data} t={t} onDelete={deleteTx} onSearch={() => setShowSearch(true)} />
      </PullToRefresh>
    );
    if (tab === 'comptes') return <Comptes D={data} t={t} onEdit={(a: unknown) => setEditAccount(a)} onNew={() => setEditAccount('new')} onImport={(bank: string) => { if (bank === 'pick') { setShowBankPicker(true); } else { setImportBank(bank); setShowImport(true); } }} onDeposit={(a) => setDepositAccount(a)} />;
    if (tab === 'groupe') return <Groupe t={t} uid={session.user.id} group={group} members={members} createGroup={createGroup} joinGroup={joinGroup} leaveGroup={leaveGroup} txs={data.txs} />;
    if (tab === 'analyses') return <Analyse D={data} t={t} allTxs={data.txs} allHistory={allHistory || []} recurrings={recurrings || []} />;
    if (tab === 'profil') return <Settings t={t} user={session.user} onLogout={logout} profile={profile} onProfile={() => setShowProfile(true)} onSecurity={() => setShowPinSetup(true)} onRecurring={() => setShowRecurring(true)} onReset={() => setShowReset(true)} onGroupe={() => setTab('groupe')} themeMode={themeMode} onThemeMode={setThemeMode} onBudgets={() => setShowBudgets(true)} onGoals={() => setShowGoals(true)} onRules={() => setShowRules(true)} onReport={() => setShowReport(true)} />;
    return null;
  };

  // Suppress unused variable warnings for hooks whose return values aren't used directly
  void reloadRec;
  void reloadGroup;

  return (
    <div style={{
      width: isDesktop ? '100%' : 375,
      minHeight: '100vh', position: 'relative', background: t.bg,
      display: isDesktop ? 'flex' : 'block',
      boxShadow: isDesktop ? 'none' : '0 0 80px rgba(0,0,0,.6)',
      transition: 'background .3s',
      paddingTop: isDesktop ? 0 : 'env(safe-area-inset-top,0px)',
    }}>
      {isDesktop && <Sidebar tab={tab} onTab={id => setTab(id)} onAdd={() => setShowEntry(true)} t={t} />}
      <div style={{ flex: 1, maxWidth: isDesktop ? 1100 : undefined, margin: isDesktop ? '0 auto' : undefined, width: '100%' }}>
        <StatusBar t={t} />
        {showIOS && <IOSBanner t={t} onDismiss={() => { setShowIOS(false); localStorage.setItem('qdq-ios', '1'); }} />}
        <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} failedCount={failedCount} isSyncing={isSyncing} t={t} />
        <main style={{ height: isDesktop ? '100vh' : 'calc(100vh - 64px - env(safe-area-inset-top,0px))', overflowY: 'auto', paddingBottom: isDesktop ? 24 : 80 }}>
          {renderMain()}
        </main>
        {showEntry && data && <ExpEntry D={data} t={t} onClose={() => setShowEntry(false)} onSave={async (p: { merchant: string; category: string } & Record<string, unknown>) => { const r = await addTx(p as never); if (p.merchant && p.merchant !== p.category) learnRule(p.merchant, p.category); return r; }} group={group} members={members} uid={session.user.id} recurrings={recurrings || []} allHistory={allHistory || []} />}
        {editBudget && data && <EditBudget D={data} t={t} uid={session.user.id} onClose={() => setEditBudget(false)} onSaved={reload} defaultPeriod={localStorage.getItem('qdq-period') || 'week'} />}
        {showProfile && <ProfileScreen t={t} user={session?.user} onClose={() => setShowProfile(false)} onSaved={(p: Profile) => { setProfile(p); setShowProfile(false); }} />}
        {showBankPicker && <BankPicker t={t} onClose={() => setShowBankPicker(false)} onPick={(b: string) => { setShowBankPicker(false); setImportBank(b); setShowImport(true); }} />}
        {showTransfer && data && <TransferEntry D={data} t={t} onClose={() => setShowTransfer(false)} onTransfer={addTransfer} />}
        {showRecurring && data && <RecurringManager t={t} accounts={data.accounts} recurrings={recurrings || []} allHistory={allHistory || []} onAdd={addRecurring} onDelete={deleteRecurring} onUpdate={updateRecurring} onClose={() => setShowRecurring(false)} />}
        {showBudgets && data && <BudgetsScreen t={t} txs={data.txs} budgets={budgets} onSave={saveBudget} onDelete={deleteBudget} onClose={() => setShowBudgets(false)} />}
        {showGoals && <GoalsScreen t={t} goals={goals} onAdd={addGoal} onDeposit={depositGoal} onDelete={deleteGoal} onClose={() => setShowGoals(false)} />}
        {showRules && <RulesScreen t={t} rules={merchantRules} onDelete={deleteRule} onClose={() => setShowRules(false)} />}
        {showReport && data && <MonthlyReport t={t} txs={data.txs} onClose={() => setShowReport(false)} />}
        {showSearch && data && <SearchScreen t={t} allTxs={data.txs} accounts={data.accounts} onClose={() => setShowSearch(false)} onDelete={deleteTx} />}
        {showReset && session && <ResetModal t={t} uid={session.user.id} onClose={() => setShowReset(false)} onDone={() => { reload(); setShowReset(false); }} />}
        {locked && <LockScreen t={t} onUnlock={() => setLocked(false)} />}
        {showPinSetup && <PinSetup t={t} user={session?.user} onClose={() => setShowPinSetup(false)} />}
        {showImport && data && importBank != null && SUPPORTED_BANKS.some(b => b.id === importBank) && (
          <ImportUniversal t={t} uid={session.user.id} accounts={data.accounts} bank={importBank} onClose={() => setShowImport(false)} onImported={reload} onCreateAccount={() => { setShowImport(false); setEditAccount('new'); }} />
        )}
        {editAccount && data && <EditAccount account={editAccount === 'new' ? null : editAccount as import('./types').Account} isNew={editAccount === 'new'} t={t} uid={session.user.id} onClose={() => setEditAccount(null)} onSaved={reload} />}
        {depositAccount && <DepositModal account={depositAccount} t={t} onClose={() => setDepositAccount(null)} onSave={addDeposit} />}
      </div>
      {!isDesktop && <Nav tab={tab} onTab={id => setTab(id)} onAdd={() => setShowEntry(true)} t={t} />}
    </div>
  );
}
