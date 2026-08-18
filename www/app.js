/* =========================================================
   الخزنة — منطق التطبيق
   كل البيانات تُخزَّن محليًا عبر localStorage — يعمل بدون إنترنت بالكامل
   ========================================================= */

(function(){
  "use strict";

  const STORAGE_KEY = "khazna_data_v1";

  const DEFAULT_CATEGORIES = [
    { id: "food",      name: "أكل ومطاعم",   color: "#E4572E", icon: "🍔" },
    { id: "transport",  name: "مواصلات",      color: "#3C8C63", icon: "🚗" },
    { id: "bills",      name: "فواتير",       color: "#2E6FB8", icon: "🧾" },
    { id: "shopping",   name: "تسوق",         color: "#B8912E", icon: "🛍️" },
    { id: "health",     name: "صحة",          color: "#B83E6F", icon: "💊" },
    { id: "fun",        name: "ترفيه",        color: "#8A5CD4", icon: "🎮" },
    { id: "other",      name: "أخرى",         color: "#6C766E", icon: "📦" },
  ];

  const COLOR_CHOICES = ["#E4572E","#3C8C63","#2E6FB8","#B8912E","#B83E6F","#8A5CD4","#6C766E","#1B9C8E","#D4396B","#5D7DE0"];

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }

  function defaultState(){
    return {
      currency: "﷼",
      theme: "light",
      pin: null,
      alertsEnabled: true,
      categories: DEFAULT_CATEGORIES.map(c => ({...c})),
      transactions: [],   // {id, type:'income'|'expense', amount, categoryId, note, date, createdAt}
      wishlist: [],        // {id, name, target, saved, createdAt}
      savingsGoals: [],    // {id, name, target, saved, dueDate, createdAt}
      budgets: {}          // { categoryId: monthlyLimit }
    };
  }

  let state = loadState();

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    }catch(e){
      console.error("تعذر تحميل البيانات، سيتم البدء من جديد", e);
      return defaultState();
    }
  }

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ===================== أدوات مساعدة =====================
  function fmt(n){
    n = Number(n) || 0;
    return n.toLocaleString('ar-EG', { maximumFractionDigits: 2 });
  }

  function catById(id){
    return state.categories.find(c => c.id === id) || state.categories[state.categories.length-1];
  }

  function monthKey(dateStr){ return dateStr.slice(0,7); }

  function showToast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  // ===================== تنقّل بين الشاشات =====================
  function goToScreen(name){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('screen-' + name);
    if(target) target.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.nav === name);
    });
    if(name === 'transactions') renderTransactionsScreen();
    if(name === 'goals') renderGoalsScreen();
    if(name === 'stats') renderStatsScreen();
    if(name === 'home') renderHome();
    window.scrollTo(0,0);
  }

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => goToScreen(el.dataset.nav));
  });

  // ===================== الرئيسية =====================
  function renderHome(){
    document.getElementById('currencyTagHome').textContent = state.currency;
    const balance = state.transactions.reduce((sum,t) => sum + (t.type==='income'? t.amount : -t.amount), 0);
    document.getElementById('balanceValue').textContent = fmt(balance);

    const dateEl = document.getElementById('dateToday');
    dateEl.textContent = new Date().toLocaleDateString('ar-SA', { weekday:'long', day:'numeric', month:'long' });

    const curMonth = new Date().toISOString().slice(0,7);
    const monthTx = state.transactions.filter(t => monthKey(t.date) === curMonth);
    const income = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expense = monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    document.getElementById('monthIncome').textContent = fmt(income);
    document.getElementById('monthExpense').textContent = fmt(expense);

    // شكل الخزنة يتفاعل مع الرصيد: كل ما زاد الرصيد يفتح الباب أكثر
    const maxBalanceRef = Math.max(1, ...state.transactions.length ? [Math.abs(balance)] : [1000], 1000);
    const openRatio = Math.min(1, balance / (maxBalanceRef * 1.2 || 1));
    const dial = document.getElementById('vaultDialMark');
    dial.setAttribute('transform', `rotate(${Math.round(openRatio*300)} 160 125)`);
    document.getElementById('vaultGlow').setAttribute('opacity', balance > 0 ? Math.min(0.5, 0.15 + openRatio*0.4) : 0);

    // آخر العمليات
    const recent = [...state.transactions].sort((a,b)=> b.createdAt - a.createdAt).slice(0,5);
    const listEl = document.getElementById('recentList');
    listEl.innerHTML = '';
    if(recent.length === 0){
      listEl.innerHTML = `<div class="empty-state"><p>ما فيه عمليات بعد — سجّل أول عملية بزر «+»</p></div>`;
    } else {
      recent.forEach(t => listEl.appendChild(txItemEl(t)));
    }
  }

  function txItemEl(t){
    const cat = catById(t.categoryId);
    const div = document.createElement('div');
    div.className = 'tx-item';
    div.innerHTML = `
      <div class="tx-icon" style="background:${cat.color}22; color:${cat.color}">${cat.icon}</div>
      <div class="tx-mid">
        <div class="tx-title">${t.note ? escapeHtml(t.note) : cat.name}</div>
        <div class="tx-sub">${cat.name} · ${formatDateShort(t.date)}</div>
      </div>
      <div class="tx-amount ${t.type==='income'?'in':'out'}">${t.type==='income'?'+':'−'} ${fmt(t.amount)}</div>
    `;
    div.addEventListener('click', () => { if(confirm('حذف هذه العملية؟')) deleteTransaction(t.id); });
    return div;
  }

  function formatDateShort(iso){
    const d = new Date(iso);
    return d.toLocaleDateString('ar-SA', { day:'numeric', month:'short' });
  }
  function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  function deleteTransaction(id){
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveState();
    renderHome();
    renderTransactionsScreen();
    showToast('تم الحذف');
  }

  // ===================== العمليات (شاشة كاملة) =====================
  let txFilter = 'all';
  document.querySelectorAll('#filterChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#filterChips .chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      txFilter = chip.dataset.filter;
      renderTransactionsScreen();
    });
  });

  function renderTransactionsScreen(){
    let list = [...state.transactions].sort((a,b)=> b.createdAt - a.createdAt);
    if(txFilter !== 'all') list = list.filter(t => t.type === txFilter);

    const container = document.getElementById('fullList');
    container.innerHTML = '';
    document.getElementById('txEmpty').classList.toggle('hidden', list.length !== 0);
    if(list.length === 0) return;

    let lastGroup = null;
    list.forEach(t => {
      const groupLabel = formatDateGroup(t.date);
      if(groupLabel !== lastGroup){
        const h = document.createElement('div');
        h.className = 'tx-group-label';
        h.textContent = groupLabel;
        container.appendChild(h);
        lastGroup = groupLabel;
      }
      container.appendChild(txItemEl(t));
    });
  }

  function formatDateGroup(iso){
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate()-1);
    if(d.toDateString() === today.toDateString()) return 'اليوم';
    if(d.toDateString() === yest.toDateString()) return 'أمس';
    return d.toLocaleDateString('ar-SA', { day:'numeric', month:'long', year:'numeric' });
  }

  // ===================== نافذة إضافة عملية =====================
  const txSheetBackdrop = document.getElementById('txSheetBackdrop');
  let currentTxType = 'expense';
  let selectedCategoryId = null;

  function openTxSheet(type){
    currentTxType = type || 'expense';
    selectedCategoryId = null;
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';
    document.getElementById('txDate').value = todayISO();
    document.getElementById('currencyTagSheet').textContent = state.currency;
    setTxType(currentTxType);
    renderCategoryPicker();
    txSheetBackdrop.classList.remove('hidden');
    setTimeout(()=>document.getElementById('txAmount').focus(), 250);
  }
  function closeTxSheet(){ txSheetBackdrop.classList.add('hidden'); }

  function setTxType(type){
    currentTxType = type;
    document.getElementById('typeExpenseBtn').classList.toggle('active', type==='expense');
    document.getElementById('typeIncomeBtn').classList.toggle('active', type==='income');
  }
  document.getElementById('typeExpenseBtn').addEventListener('click', ()=>setTxType('expense'));
  document.getElementById('typeIncomeBtn').addEventListener('click', ()=>setTxType('income'));

  function renderCategoryPicker(){
    const wrap = document.getElementById('categoryPicker');
    wrap.innerHTML = '';
    state.categories.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'cat-pill' + (selectedCategoryId===cat.id ? ' active' : '');
      pill.type = 'button';
      pill.innerHTML = `<span class="cat-swatch" style="background:${cat.color}"></span>${cat.icon} ${cat.name}`;
      pill.addEventListener('click', () => {
        selectedCategoryId = cat.id;
        renderCategoryPicker();
      });
      wrap.appendChild(pill);
    });
    if(!selectedCategoryId && state.categories.length){
      selectedCategoryId = state.categories[0].id;
      renderCategoryPicker();
    }
  }

  document.getElementById('btnQuickIncome').addEventListener('click', ()=>openTxSheet('income'));
  document.getElementById('btnQuickExpense').addEventListener('click', ()=>openTxSheet('expense'));
  document.getElementById('btnFab').addEventListener('click', ()=>openTxSheet('expense'));
  document.getElementById('btnCancelTx').addEventListener('click', closeTxSheet);
  txSheetBackdrop.addEventListener('click', (e)=>{ if(e.target===txSheetBackdrop) closeTxSheet(); });

  document.getElementById('btnSaveTx').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('txAmount').value);
    if(!amount || amount <= 0){ showToast('أدخل مبلغ صحيح'); return; }
    if(!selectedCategoryId){ showToast('اختر تصنيف'); return; }
    const date = document.getElementById('txDate').value || todayISO();
    const note = document.getElementById('txNote').value.trim();

    state.transactions.push({
      id: uid(),
      type: currentTxType,
      amount,
      categoryId: selectedCategoryId,
      note,
      date,
      createdAt: Date.now()
    });
    saveState();
    closeTxSheet();
    checkBudgetAlert(selectedCategoryId);
    playVaultFeedback(currentTxType);
    renderHome();
    renderTransactionsScreen();
    showToast(currentTxType==='income' ? 'تمت إضافة الإيداع' : 'تم تسجيل المصروف');
  });

  function playVaultFeedback(type){
    const door = document.getElementById('vaultDoor');
    door.classList.remove('pulse'); void door.offsetWidth; door.classList.add('pulse');
    if(type === 'income'){
      const burst = document.getElementById('coinBurst');
      burst.innerHTML = '';
      for(let i=0;i<6;i++){
        const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
        c.setAttribute('cx', 160 + (Math.random()*80-40));
        c.setAttribute('cy', 150);
        c.setAttribute('r', 6);
        c.classList.add('coin');
        c.style.animationDelay = (i*0.06)+'s';
        burst.appendChild(c);
      }
    }
  }

  function checkBudgetAlert(categoryId){
    if(!state.alertsEnabled) return;
    const limit = state.budgets[categoryId];
    if(!limit) return;
    const curMonth = new Date().toISOString().slice(0,7);
    const spent = state.transactions
      .filter(t => t.type==='expense' && t.categoryId===categoryId && monthKey(t.date)===curMonth)
      .reduce((s,t)=>s+t.amount,0);
    if(spent > limit){
      setTimeout(()=> showToast(`تنبيه: تجاوزت ميزانية «${catById(categoryId).name}» لهذا الشهر`), 600);
    }
  }

  // ===================== الأهداف والتمنيات =====================
  document.querySelectorAll('.tab-mini').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-mini').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.goaltab;
      document.getElementById('wishlistPane').classList.toggle('hidden', which!=='wishlist');
      document.getElementById('savingsPane').classList.toggle('hidden', which!=='savings');
    });
  });

  function renderGoalsScreen(){
    renderWishlist();
    renderSavingsGoals();
  }

  function goalCardEl(item, kind){
    const pct = item.target > 0 ? Math.min(100, Math.round((item.saved/item.target)*100)) : 0;
    const div = document.createElement('div');
    div.className = 'goal-card';
    const done = item.saved >= item.target && item.target > 0;
    let etaHtml = '';
    if(kind === 'savings' && item.dueDate && !done){
      const days = Math.max(1, Math.ceil((new Date(item.dueDate) - new Date())/86400000));
      const remaining = Math.max(0, item.target - item.saved);
      etaHtml = `<span class="goal-eta">${fmt(remaining/days)} ${state.currency}/يوم للوصول بالوقت</span>`;
    }
    div.innerHTML = `
      <div class="goal-card-top">
        <div>
          <div class="goal-name">${escapeHtml(item.name)}</div>
          <div class="goal-target">${fmt(item.saved)} / ${fmt(item.target)} ${state.currency}</div>
        </div>
        <button class="goal-menu-btn" data-del="${item.id}">⋯</button>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="goal-bottom">
        ${done ? `<span class="goal-done-badge">✓ تم الوصول للهدف</span>` : `<span class="goal-percent">${pct}%</span>`}
        ${etaHtml}
        ${!done ? `<button class="goal-add-btn" data-add="${item.id}" data-kind="${kind}">إضافة مبلغ</button>` : ''}
      </div>
    `;
    div.querySelector('[data-del]')?.addEventListener('click', () => {
      if(confirm('حذف هذا الهدف؟')){
        if(kind==='wishlist') state.wishlist = state.wishlist.filter(w=>w.id!==item.id);
        else state.savingsGoals = state.savingsGoals.filter(g=>g.id!==item.id);
        saveState(); renderGoalsScreen();
      }
    });
    const addBtn = div.querySelector('[data-add]');
    if(addBtn) addBtn.addEventListener('click', () => openAddToGoal(item.id, kind));
    return div;
  }

  function renderWishlist(){
    const wrap = document.getElementById('wishlistList');
    wrap.innerHTML = '';
    document.getElementById('wishEmpty').classList.toggle('hidden', state.wishlist.length!==0);
    state.wishlist.forEach(item => wrap.appendChild(goalCardEl(item,'wishlist')));
  }
  function renderSavingsGoals(){
    const wrap = document.getElementById('savingsList');
    wrap.innerHTML = '';
    document.getElementById('savingsEmpty').classList.toggle('hidden', state.savingsGoals.length!==0);
    state.savingsGoals.forEach(item => wrap.appendChild(goalCardEl(item,'savings')));
  }

  // نافذة إضافة هدف/تمنية
  const goalSheetBackdrop = document.getElementById('goalSheetBackdrop');
  let goalSheetKind = 'wishlist';
  document.getElementById('btnAddGoal').addEventListener('click', () => {
    goalSheetKind = document.querySelector('.tab-mini.active').dataset.goaltab;
    document.getElementById('goalSheetTitle').textContent = goalSheetKind==='wishlist' ? 'تمنية جديدة' : 'هدف ادخار جديد';
    document.getElementById('goalDateField').classList.toggle('hidden', goalSheetKind==='wishlist');
    document.getElementById('goalName').value = '';
    document.getElementById('goalTarget').value = '';
    document.getElementById('goalDate').value = '';
    goalSheetBackdrop.classList.remove('hidden');
  });
  document.getElementById('btnCancelGoal').addEventListener('click', ()=>goalSheetBackdrop.classList.add('hidden'));
  goalSheetBackdrop.addEventListener('click', (e)=>{ if(e.target===goalSheetBackdrop) goalSheetBackdrop.classList.add('hidden'); });

  document.getElementById('btnSaveGoal').addEventListener('click', () => {
    const name = document.getElementById('goalName').value.trim();
    const target = parseFloat(document.getElementById('goalTarget').value);
    if(!name){ showToast('أدخل الاسم'); return; }
    if(!target || target<=0){ showToast('أدخل مبلغ صحيح'); return; }
    const item = { id: uid(), name, target, saved: 0, createdAt: Date.now() };
    if(goalSheetKind === 'savings') item.dueDate = document.getElementById('goalDate').value || null;
    (goalSheetKind==='wishlist' ? state.wishlist : state.savingsGoals).push(item);
    saveState();
    goalSheetBackdrop.classList.add('hidden');
    renderGoalsScreen();
    showToast('تم الحفظ');
  });

  // نافذة إضافة مبلغ لهدف
  const addToGoalBackdrop = document.getElementById('addToGoalBackdrop');
  let addToGoalTarget = { id:null, kind:null };
  function openAddToGoal(id, kind){
    addToGoalTarget = { id, kind };
    document.getElementById('addToGoalAmount').value = '';
    document.getElementById('currencyTagGoalAdd').textContent = state.currency;
    addToGoalBackdrop.classList.remove('hidden');
  }
  document.getElementById('btnCancelAddToGoal').addEventListener('click', ()=>addToGoalBackdrop.classList.add('hidden'));
  addToGoalBackdrop.addEventListener('click', (e)=>{ if(e.target===addToGoalBackdrop) addToGoalBackdrop.classList.add('hidden'); });
  document.getElementById('btnConfirmAddToGoal').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('addToGoalAmount').value);
    if(!amount || amount<=0){ showToast('أدخل مبلغ صحيح'); return; }
    const list = addToGoalTarget.kind==='wishlist' ? state.wishlist : state.savingsGoals;
    const item = list.find(g=>g.id===addToGoalTarget.id);
    if(item){ item.saved += amount; }
    saveState();
    addToGoalBackdrop.classList.add('hidden');
    renderGoalsScreen();
    showToast('تمت الإضافة للهدف');
  });

  // ===================== الإحصائيات =====================
  let statsMonthOffset = 0;
  document.getElementById('prevMonth').addEventListener('click', ()=>{ statsMonthOffset--; renderStatsScreen(); });
  document.getElementById('nextMonth').addEventListener('click', ()=>{ statsMonthOffset = Math.min(0, statsMonthOffset+1); renderStatsScreen(); });

  function getStatsMonthDate(){
    const d = new Date();
    d.setMonth(d.getMonth() + statsMonthOffset);
    return d;
  }

  function renderStatsScreen(){
    const d = getStatsMonthDate();
    const key = d.toISOString().slice(0,7);
    document.getElementById('statsMonthLabel').textContent = d.toLocaleDateString('ar-SA', { month:'long', year:'numeric' });

    const monthTx = state.transactions.filter(t => monthKey(t.date) === key);
    const expenses = monthTx.filter(t=>t.type==='expense');
    const income = monthTx.filter(t=>t.type==='income');

    // Pie chart by category
    const totalsByCat = {};
    expenses.forEach(t => { totalsByCat[t.categoryId] = (totalsByCat[t.categoryId]||0) + t.amount; });
    const totalExpense = expenses.reduce((s,t)=>s+t.amount,0);
    drawPie(totalsByCat, totalExpense);

    // Bar chart income vs expense (last 4 months incl. current view)
    drawBarChart(d);

    // Budget bars
    drawBudgetBars(key);
  }

  function drawPie(totalsByCat, total){
    const svg = document.getElementById('pieSvg');
    svg.innerHTML = '';
    document.getElementById('pieTotal').textContent = fmt(total);
    const legend = document.getElementById('pieLegend');
    legend.innerHTML = '';

    if(total <= 0){
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx',100); circle.setAttribute('cy',100); circle.setAttribute('r',80);
      circle.setAttribute('fill','none');
      circle.setAttribute('stroke','var(--border)');
      circle.setAttribute('stroke-width','24');
      svg.appendChild(circle);
      legend.innerHTML = `<div class="legend-item">لا يوجد مصروفات هذا الشهر</div>`;
      return;
    }

    let cumulative = 0;
    const entries = Object.entries(totalsByCat).sort((a,b)=>b[1]-a[1]);
    const r = 80, cx=100, cy=100, circumference = 2*Math.PI*r;

    entries.forEach(([catId, amt]) => {
      const cat = catById(catId);
      const fraction = amt/total;
      const dash = fraction * circumference;
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx',cx); circle.setAttribute('cy',cy); circle.setAttribute('r',r);
      circle.setAttribute('fill','none');
      circle.setAttribute('stroke',cat.color);
      circle.setAttribute('stroke-width','24');
      circle.setAttribute('stroke-dasharray', `${dash} ${circumference-dash}`);
      circle.setAttribute('stroke-dashoffset', -cumulative);
      circle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
      svg.appendChild(circle);
      cumulative += dash;

      const li = document.createElement('div');
      li.className = 'legend-item';
      li.innerHTML = `<span class="legend-dot" style="background:${cat.color}"></span>${cat.icon} ${cat.name} · ${Math.round(fraction*100)}%`;
      legend.appendChild(li);
    });
  }

  function drawBarChart(centerDate){
    const wrap = document.getElementById('barChart');
    wrap.innerHTML = '';
    const months = [];
    for(let i=3;i>=0;i--){
      const dd = new Date(centerDate);
      dd.setMonth(dd.getMonth()-i);
      months.push(dd);
    }
    const data = months.map(dd => {
      const key = dd.toISOString().slice(0,7);
      const tx = state.transactions.filter(t=>monthKey(t.date)===key);
      return {
        label: dd.toLocaleDateString('ar-SA',{month:'short'}),
        income: tx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),
        expense: tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)
      };
    });
    const max = Math.max(1, ...data.flatMap(d=>[d.income,d.expense]));

    data.forEach(d => {
      const col = document.createElement('div');
      col.className = 'bar-col';
      col.innerHTML = `
        <div style="display:flex; gap:4px; align-items:flex-end; height:100%; width:100%; justify-content:center;">
          <div class="bar-track"><div class="bar-fill income" style="height:${(d.income/max*100)}%"></div></div>
          <div class="bar-track"><div class="bar-fill expense" style="height:${(d.expense/max*100)}%"></div></div>
        </div>
        <span class="bar-label">${d.label}</span>
      `;
      wrap.appendChild(col);
    });
  }

  function drawBudgetBars(monthKeyStr){
    const wrap = document.getElementById('budgetBars');
    wrap.innerHTML = '';
    const budgetEntries = Object.entries(state.budgets).filter(([,limit]) => limit > 0);
    document.getElementById('budgetEmpty').classList.toggle('hidden', budgetEntries.length !== 0);

    budgetEntries.forEach(([catId, limit]) => {
      const cat = catById(catId);
      const spent = state.transactions
        .filter(t=>t.type==='expense' && t.categoryId===catId && monthKey(t.date)===monthKeyStr)
        .reduce((s,t)=>s+t.amount,0);
      const pct = Math.min(100, Math.round((spent/limit)*100));
      const cls = spent > limit ? 'over' : (pct > 80 ? 'warn' : 'ok');
      const row = document.createElement('div');
      row.innerHTML = `
        <div class="budget-row-label"><b>${cat.icon} ${cat.name}</b><span>${fmt(spent)} / ${fmt(limit)} ${state.currency}</span></div>
        <div class="budget-track"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
      `;
      wrap.appendChild(row);
    });
  }

  // نافذة تحديد الميزانية
  const budgetSheetBackdrop = document.getElementById('budgetSheetBackdrop');
  document.getElementById('btnSetBudget').addEventListener('click', () => {
    const wrap = document.getElementById('budgetFields');
    wrap.innerHTML = '';
    state.categories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'budget-field-row';
      row.innerHTML = `
        <span class="cat-swatch" style="background:${cat.color}"></span>
        <span>${cat.icon} ${cat.name}</span>
        <input type="number" inputmode="decimal" data-cat="${cat.id}" value="${state.budgets[cat.id]||''}" placeholder="بدون حد">
      `;
      wrap.appendChild(row);
    });
    budgetSheetBackdrop.classList.remove('hidden');
  });
  document.getElementById('btnCancelBudget').addEventListener('click', ()=>budgetSheetBackdrop.classList.add('hidden'));
  budgetSheetBackdrop.addEventListener('click', (e)=>{ if(e.target===budgetSheetBackdrop) budgetSheetBackdrop.classList.add('hidden'); });
  document.getElementById('btnSaveBudget').addEventListener('click', () => {
    document.querySelectorAll('#budgetFields input').forEach(inp => {
      const val = parseFloat(inp.value);
      if(val > 0) state.budgets[inp.dataset.cat] = val;
      else delete state.budgets[inp.dataset.cat];
    });
    saveState();
    budgetSheetBackdrop.classList.add('hidden');
    renderStatsScreen();
    showToast('تم حفظ الميزانية');
  });

  // ===================== الإعدادات =====================
  function renderSettings(){
    document.getElementById('currencySelect').value = state.currency;
    document.getElementById('darkModeToggle').checked = state.theme === 'dark';
    document.getElementById('pinToggle').checked = !!state.pin;
    document.getElementById('alertsToggle').checked = state.alertsEnabled;
    renderCategoryManageList();
  }

  document.getElementById('currencySelect').addEventListener('change', (e) => {
    state.currency = e.target.value;
    saveState();
    renderHome();
  });

  document.getElementById('darkModeToggle').addEventListener('change', (e) => {
    state.theme = e.target.checked ? 'dark' : 'light';
    applyTheme();
    saveState();
  });
  function applyTheme(){
    document.documentElement.setAttribute('data-theme', state.theme);
    document.body.setAttribute('data-theme', state.theme);
  }

  document.getElementById('alertsToggle').addEventListener('change', (e) => {
    state.alertsEnabled = e.target.checked;
    saveState();
  });

  function renderCategoryManageList(){
    const wrap = document.getElementById('categoryManageList');
    wrap.innerHTML = '';
    state.categories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'category-manage-row';
      row.innerHTML = `
        <span class="cat-swatch" style="background:${cat.color}"></span>
        <span>${cat.icon} ${cat.name}</span>
        <button class="cat-del" data-id="${cat.id}">حذف</button>
      `;
      row.querySelector('.cat-del').addEventListener('click', () => {
        if(state.categories.length <= 1){ showToast('لازم يبقى تصنيف واحد على الأقل'); return; }
        if(confirm('حذف هذا التصنيف؟ العمليات المرتبطة به تبقى محفوظة.')){
          state.categories = state.categories.filter(c => c.id !== cat.id);
          saveState();
          renderCategoryManageList();
        }
      });
      wrap.appendChild(row);
    });
  }

  const categorySheetBackdrop = document.getElementById('categorySheetBackdrop');
  let pickedColor = COLOR_CHOICES[0];
  document.getElementById('btnAddCategory').addEventListener('click', () => {
    document.getElementById('categoryName').value = '';
    pickedColor = COLOR_CHOICES[Math.floor(Math.random()*COLOR_CHOICES.length)];
    renderColorPicker();
    categorySheetBackdrop.classList.remove('hidden');
  });
  document.getElementById('btnCancelCategory').addEventListener('click', ()=>categorySheetBackdrop.classList.add('hidden'));
  categorySheetBackdrop.addEventListener('click', (e)=>{ if(e.target===categorySheetBackdrop) categorySheetBackdrop.classList.add('hidden'); });

  function renderColorPicker(){
    const wrap = document.getElementById('colorPicker');
    wrap.innerHTML = '';
    COLOR_CHOICES.forEach(color => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'color-dot' + (color===pickedColor ? ' active' : '');
      dot.style.background = color;
      dot.addEventListener('click', () => { pickedColor = color; renderColorPicker(); });
      wrap.appendChild(dot);
    });
  }

  document.getElementById('btnSaveCategory').addEventListener('click', () => {
    const name = document.getElementById('categoryName').value.trim();
    if(!name){ showToast('أدخل اسم التصنيف'); return; }
    state.categories.push({ id: uid(), name, color: pickedColor, icon: '🏷️' });
    saveState();
    categorySheetBackdrop.classList.add('hidden');
    renderCategoryManageList();
    showToast('تمت الإضافة');
  });

  // نسخ احتياطي / استيراد / حذف
  document.getElementById('btnExportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `khazna-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('تم تصدير النسخة الاحتياطية');
  });

  document.getElementById('btnImportData').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const imported = JSON.parse(reader.result);
        state = Object.assign(defaultState(), imported);
        saveState();
        applyTheme();
        renderAll();
        showToast('تم استيراد البيانات بنجاح');
      }catch(err){
        showToast('الملف غير صالح');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('btnResetData').addEventListener('click', () => {
    if(confirm('هذا الإجراء سيحذف كل بياناتك نهائيًا. متأكد؟')){
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      saveState();
      applyTheme();
      renderAll();
      showToast('تم حذف كل البيانات');
    }
  });

  // ===================== قفل PIN =====================
  const lockScreen = document.getElementById('lockScreen');
  let pinBuffer = '';
  let pinSetupMode = false;
  let pinSetupFirst = '';

  document.getElementById('pinToggle').addEventListener('change', (e) => {
    if(e.target.checked){
      pinSetupMode = true; pinSetupFirst = ''; pinBuffer = '';
      document.getElementById('lockError').textContent = '';
      document.querySelector('.lock-card h2').textContent = 'أنشئ رمز جديد';
      updatePinDots();
      lockScreen.classList.remove('hidden');
    } else {
      state.pin = null;
      saveState();
      showToast('تم إلغاء القفل');
    }
  });

  document.getElementById('pinPad').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    if(btn.id === 'pinCancel'){
      lockScreen.classList.add('hidden');
      pinBuffer = '';
      if(pinSetupMode){ document.getElementById('pinToggle').checked = false; pinSetupMode=false; }
      return;
    }
    if(btn.id === 'pinDel'){ pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); return; }
    if(btn.dataset.num === undefined) return;
    if(pinBuffer.length >= 4) return;
    pinBuffer += btn.dataset.num;
    updatePinDots();
    if(pinBuffer.length === 4) handlePinComplete();
  });

  function updatePinDots(){
    const dots = document.querySelectorAll('#pinDots span');
    dots.forEach((d,i) => d.classList.toggle('filled', i < pinBuffer.length));
  }

  function handlePinComplete(){
    if(pinSetupMode){
      if(!pinSetupFirst){
        pinSetupFirst = pinBuffer;
        pinBuffer = '';
        document.querySelector('.lock-card h2').textContent = 'أعد إدخال الرمز للتأكيد';
        updatePinDots();
      } else {
        if(pinBuffer === pinSetupFirst){
          state.pin = pinBuffer;
          saveState();
          pinSetupMode = false;
          lockScreen.classList.add('hidden');
          showToast('تم تفعيل القفل');
        } else {
          document.getElementById('lockError').textContent = 'الرمز غير متطابق، حاول مرة أخرى';
          pinSetupFirst = ''; pinBuffer = '';
          document.querySelector('.lock-card h2').textContent = 'أنشئ رمز جديد';
          updatePinDots();
        }
      }
    } else {
      if(pinBuffer === state.pin){
        lockScreen.classList.add('hidden');
        pinBuffer = '';
      } else {
        document.getElementById('lockError').textContent = 'رمز غير صحيح';
        pinBuffer = '';
        updatePinDots();
      }
    }
  }

  function maybeShowLock(){
    if(state.pin){
      document.querySelector('.lock-card h2').textContent = 'أدخل الرمز';
      document.getElementById('lockError').textContent = '';
      pinBuffer = ''; updatePinDots();
      lockScreen.classList.remove('hidden');
    }
  }

  // ===================== تنبيهات (زر الجرس) =====================
  document.getElementById('btnNotifs').addEventListener('click', () => {
    const curMonth = new Date().toISOString().slice(0,7);
    const overBudget = Object.entries(state.budgets).filter(([catId, limit]) => {
      const spent = state.transactions.filter(t=>t.type==='expense'&&t.categoryId===catId&&monthKey(t.date)===curMonth).reduce((s,t)=>s+t.amount,0);
      return spent > limit;
    });
    if(overBudget.length === 0){ showToast('ما فيه تنبيهات حالياً 👍'); return; }
    const names = overBudget.map(([catId]) => catById(catId).name).join('، ');
    showToast(`تجاوزت الميزانية في: ${names}`);
  });

  function updateNotifDot(){
    const curMonth = new Date().toISOString().slice(0,7);
    const hasAlert = Object.entries(state.budgets).some(([catId, limit]) => {
      const spent = state.transactions.filter(t=>t.type==='expense'&&t.categoryId===catId&&monthKey(t.date)===curMonth).reduce((s,t)=>s+t.amount,0);
      return spent > limit;
    });
    document.getElementById('notifDot').classList.toggle('hidden', !hasAlert);
  }

  // ===================== إعادة رسم شاملة =====================
  function renderAll(){
    renderHome();
    renderTransactionsScreen();
    renderGoalsScreen();
    renderStatsScreen();
    renderSettings();
    updateNotifDot();
  }

  // ===================== بدء التشغيل =====================
  function init(){
    applyTheme();
    document.getElementById('txDate').value = todayISO();
    renderAll();
    maybeShowLock();
  }

  // مراقبة التنبيهات عند أي تحديث بيانات
  const _origSave = saveState;
  saveState = function(){ _origSave(); updateNotifDot(); };

  init();
})();
