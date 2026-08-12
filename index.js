window.authReady.then(function () {
    // Real per-day data straight from Firestore — one document per person
    // (people/NABH, people/AVI, people/ADI), the same ones the Person page
    // writes to. `onSnapshot` means this updates live: if Nabh logs
    // something on his phone, your Home screen updates on its own, no
    // refresh needed.
    const today = new Date();
    const todayDayOfMonth = today.getDate();
    const year = today.getFullYear();
    const monthIndex = today.getMonth();

    function formatISODate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }
    const todayISO = formatISODate(today);

    function renderStreak(container, dailyLog) {
      container.innerHTML = '';
      const loggedDates = (dailyLog || []).map(e => e.dateISO);
      let filledCount = 0;
      for (let day = 1; day <= todayDayOfMonth; day++) {
        const iso = formatISODate(new Date(year, monthIndex, day));
        const isFilled = loggedDates.includes(iso);
        if (isFilled) filledCount++;
        const dot = document.createElement('div');
        dot.className = 'streak-dot ' + (isFilled ? 'filled' : 'empty');
        container.appendChild(dot);
      }
      return filledCount;
    }

    // Whoever has logged the most days this month (most filled circles)
    // moves to the top of the list — re-sorted live, every time anyone's
    // log changes, not just once on page load.
    const peopleList = document.querySelector('.people-list');
    const personCards = {};
    ['nabh', 'avi', 'adi'].forEach((person) => {
      const header = document.querySelector('.person-card-header[data-person="' + person + '"]');
      if (header) personCards[person] = header.closest('.person-card');
    });
    const streakCounts = { nabh: 0, avi: 0, adi: 0 };

    function reorderPeopleList() {
      Object.keys(personCards)
        .sort((a, b) => streakCounts[b] - streakCounts[a]) // most filled circles first
        .forEach((person) => {
          // appendChild on a node already in the DOM moves it rather than
          // duplicating it, so this just re-orders the existing cards.
          peopleList.appendChild(personCards[person]);
        });
    }

    // One live listener per person — each updates that person's streak dots
    // and today's status line whenever their data changes, from anywhere.
    ['nabh', 'avi', 'adi'].forEach(person => {
      db.collection('people').doc(person.toUpperCase()).onSnapshot(snap => {
        const data = snap.data() || {};
        const dailyLog = data.dailyLog || [];

        const streakEl = document.querySelector('[data-streak="' + person + '"]');
        if (streakEl) {
          streakCounts[person] = renderStreak(streakEl, dailyLog);
          reorderPeopleList();
        }

        const statusEl = document.querySelector('[data-status="' + person + '"]');
        if (statusEl) {
          const todaysEntry = dailyLog.find(e => e.dateISO === todayISO);
          statusEl.textContent = todaysEntry ? todaysEntry.text : '';
        }
      });
    });

    // ============ EDITABLE MONTHLY GOAL + PROGRESS (5 eyes) ============
    // Both live in one Firestore doc, goals/<MONTH> — text you type and
    // which eyes are filled, shared live between all three of you. Click
    // the pencil to edit the goal text (Enter/clicking away saves it), and
    // each eye jumps straight to filled on click (click again to clear).
    const goalAmountText = document.getElementById('goalAmountText');
    const goalAmountInput = document.getElementById('goalAmountInput');
    const goalEditBtn = document.getElementById('goalEditBtn');
    const goalMonthName = document.querySelector('.goal-title').textContent.replace('GOAL:', '').trim();
    const goalDocRef = db.collection('goals').doc(goalMonthName);
    const goalProgressEl = document.getElementById('goalProgress');
    const GOAL_EYE_COUNT = 5;

    function startEditingGoal() {
      goalAmountInput.value = goalAmountText.textContent;
      goalAmountText.hidden = true;
      goalEditBtn.hidden = true;
      goalAmountInput.hidden = false;
      goalAmountInput.focus();
      goalAmountInput.select();
    }
    function saveGoal() {
      const value = goalAmountInput.value.trim();
      if (value) goalDocRef.set({ text: value }, { merge: true });
      goalAmountInput.hidden = true;
      goalAmountText.hidden = false;
      goalEditBtn.hidden = false;
    }
    goalEditBtn.addEventListener('click', startEditingGoal);
    goalAmountInput.addEventListener('blur', saveGoal);
    goalAmountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goalAmountInput.blur(); // triggers saveGoal via the blur handler
      if (e.key === 'Escape') {
        goalAmountInput.hidden = true;
        goalAmountText.hidden = false;
        goalEditBtn.hidden = false;
      }
    });

    const eyeEmptySVG = '<svg viewBox="0 0 52 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M25.8682 0.557617C36.3513 0.557673 45.5926 5.85753 51.0605 13.9209C45.5927 21.9846 36.3515 27.2851 25.8682 27.2852C15.3844 27.2852 6.14174 21.9851 0.673828 13.9209C6.1418 5.85704 15.3846 0.557642 25.8682 0.557617Z" stroke="#F0F0F0" stroke-width="1.115"/></svg>';
    function eyeFilledSVG(filterId) {
      return '<svg viewBox="0 0 56 28" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#' + filterId + ')"><path d="M29.8682 0.557617C40.3513 0.557673 49.5926 5.85753 55.0605 13.9209C49.5927 21.9846 40.3515 27.2851 29.8682 27.2852C19.3844 27.2852 10.1417 21.9851 4.67383 13.9209C10.1418 5.85704 19.3846 0.557642 29.8682 0.557617ZM29.8369 4.07324C24.3923 4.07329 19.9776 8.48209 19.9775 13.9219C19.9777 19.3616 24.3924 23.7705 29.8369 23.7705C35.2816 23.7705 39.6961 19.3616 39.6963 13.9219C39.6963 8.48207 35.2817 4.07327 29.8369 4.07324Z" fill="#1AFF55" stroke="#1AFF55" stroke-width="1.115"/><path d="M20.502 13.9235C20.502 8.75089 24.6953 4.55762 29.8679 4.55762C35.0407 4.55764 39.234 8.75091 39.234 13.9235C39.234 19.0961 35.0407 23.2896 29.8679 23.2896C24.6953 23.2896 20.502 19.0961 20.502 13.9235Z" fill="white"/></g><defs><filter id="' + filterId + '" x="0" y="-4" width="59.736" height="35.8424" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset/><feGaussianBlur stdDeviation="2"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.101961 0 0 0 0 1 0 0 0 0 0.333333 0 0 0 1 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/></filter></defs></svg>';
    }

    let goalProgress = new Array(GOAL_EYE_COUNT).fill(false); // kept in sync by the listener below

    function renderGoalProgress() {
      goalProgressEl.innerHTML = '';
      goalProgress.forEach((filled, i) => {
        const btn = document.createElement('button');
        btn.className = 'goal-eye';
        btn.setAttribute('aria-label', 'Goal progress step ' + (i + 1) + (filled ? ' (achieved)' : ' (not achieved)'));
        btn.innerHTML = filled ? eyeFilledSVG('goal-eye-glow-' + i) : eyeEmptySVG;
        btn.addEventListener('click', () => {
          const updated = goalProgress.slice();
          updated[i] = !updated[i]; // click to fill, click again to clear
          goalDocRef.set({ progress: updated }, { merge: true });
          // No manual re-render — the listener below picks up the write.
        });
        goalProgressEl.appendChild(btn);
      });
    }

    // One listener for both the goal text and its progress eyes — updates
    // live if anyone (including you, on another tab) changes either.
    goalDocRef.onSnapshot(snap => {
      const data = snap.data() || {};
      goalAmountText.textContent = data.text || 'Earn 1 Lakh rupees';
      goalProgress = (Array.isArray(data.progress) && data.progress.length === GOAL_EYE_COUNT)
        ? data.progress
        : new Array(GOAL_EYE_COUNT).fill(false);
      renderGoalProgress();
    });

    // Tapping a person's name/chevron opens their Person Page. No real
    // routing yet (Stage 3 territory) — just a link with ?person=<name>
    // that person.html reads to know whose week to show.
    document.querySelectorAll('.person-card-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const person = btn.getAttribute('data-person');
        window.location.href = 'person.html?person=' + person;
      });
    });

    // Tells update-checker.js whether now is a safe moment to auto-reload
    // this page — not while you're mid-edit on the monthly goal text,
    // since reloading then would wipe out what you were typing.
    window.isSafeToAutoReload = function () {
      return goalAmountInput.hidden;
    };

});
