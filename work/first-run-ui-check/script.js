const byId = (id) => document.getElementById(id);
const gate = byId('gate');
const shell = byId('site-shell');
const loginForm = byId('login-form');
const loginError = byId('login-error');
const modalLayer = byId('modal-layer');
const toast = byId('toast');
let memories;
let currentPhotoIndex = 0;
let visiblePhotoIndexes = [];
let lastFocused = null;
let toastTimer;
let counterTimer;
let dreamItems = [];
let setupMode = false;
document.body.classList.add('is-locked');

const arabicNumber = (value) => new Intl.NumberFormat('ar-EG').format(value);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const mediaUrl = (file, type = 'image') => `/media/${type}/${encodeURIComponent(file)}`;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3000);
}

function unlockWorld(message = '') {
  gate.classList.add('is-leaving');
  shell.inert = false;
  shell.classList.add('is-ready');
  document.body.classList.add('is-unlocked');
  document.body.classList.remove('is-locked');
  setTimeout(() => gate.setAttribute('aria-hidden', 'true'), 850);
  loadPrivateWorld();
  if (message) setTimeout(() => showToast(message), 700);
}

function loadPrivateWorld() {
  if (memories) return;
  const script = document.createElement('script');
  script.src = '/api/config';
  script.onload = () => {
    memories = window.MEMORIES;
    if (!memories) return showToast('تعذر فتح الحكاية الآن.');
    renderWorld();
  };
  script.onerror = () => showToast('تعذر فتح الحكاية الآن. حاولي مرة أخرى.');
  document.head.append(script);
}

async function checkExistingSession() {
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    if (result.authenticated) return unlockWorld();
    const setupResponse = await fetch('/api/setup/status', { credentials: 'same-origin', cache: 'no-store' });
    const setup = await setupResponse.json();
    if (!setup.setupRequired) return;
    if (setup.setupAllowed) enableSetupMode();
    else {
      byId('gate-title').innerHTML = 'هذا العالم ينتظر<br>إعداده أولاً';
      byId('gate-subtitle').textContent = 'افتحي هذه الصفحة على الجهاز الذي يستضيف الموقع لإنشاء كلمة مروره.';
      byId('login-submit').disabled = true;
      loginError.textContent = '';
    }
  } catch {
    loginError.textContent = 'لا نستطيع الوصول إلى عالمنا الآن.';
  }
}

function enableSetupMode() {
  setupMode = true;
  byId('gate-title').innerHTML = 'لنبدأ بحماية<br>عالمنا الصغير';
  byId('gate-subtitle').textContent = 'اختاري كلمة مرور تبقى بيننا، ثم ادخلي إلى حكايتنا.';
  byId('password-label').textContent = 'اختاري كلمة المرور الخاصة بنا';
  byId('password').placeholder = 'اختاري كلمة مرور من عشرة أحرف على الأقل...';
  byId('password').autocomplete = 'new-password';
  byId('confirm-password-wrap').hidden = false;
  byId('confirm-password').required = true;
  byId('setup-helper').hidden = false;
  byId('login-submit').querySelector('span').textContent = 'احفظي كلمة مرورنا';
}

function enableLoginMode() {
  setupMode = false;
  byId('gate-title').innerHTML = 'هذا العالم صُنع<br>لشخص واحد فقط';
  byId('gate-subtitle').textContent = 'لأن بعض الذكريات أجمل من أن يراها أحد غيرنا.';
  byId('password-label').textContent = 'كلمة المرور الخاصة بنا';
  byId('password').placeholder = 'أدخلي كلمة المرور الخاصة بنا...';
  byId('password').autocomplete = 'current-password';
  byId('confirm-password-wrap').hidden = true;
  byId('confirm-password').required = false;
  byId('confirm-password').value = '';
  byId('setup-helper').hidden = true;
  byId('login-submit').querySelector('span').textContent = 'افتحي عالمنا';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = byId('login-submit');
  const password = byId('password');
  const label = submit.querySelector('span');
  submit.disabled = true;
  label.textContent = 'لحظة من فضلكِ...';
  loginError.textContent = '';
  try {
    if (setupMode && password.value !== byId('confirm-password').value) {
      loginError.textContent = 'كلمتا المرور غير متطابقتين.';
      byId('confirm-password').focus();
      return;
    }
    const response = await fetch(setupMode ? '/api/setup' : '/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value, confirmPassword: setupMode ? byId('confirm-password').value : undefined })
    });
    const result = await response.json();
    if (!response.ok) {
      loginError.textContent = result.error || 'يبدو أن هذا العالم ينتظر كلمة السر الصحيحة.';
      password.select();
      return;
    }
    password.value = '';
    byId('confirm-password').value = '';
    if (setupMode) enableLoginMode();
    unlockWorld(result.message);
  } catch {
    loginError.textContent = 'لا نستطيع الوصول إلى عالمنا الآن. حاولي مرة أخرى.';
  } finally {
    submit.disabled = false;
    label.textContent = setupMode ? 'احفظي كلمة مرورنا' : 'افتحي عالمنا';
  }
});

byId('show-password').addEventListener('click', (event) => {
  const input = byId('password');
  const showing = input.type === 'password';
  input.type = showing ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-label', showing ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
});

byId('logout-button').addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* the local view still closes */ }
  memories = null;
  window.MEMORIES = undefined;
  document.body.classList.remove('is-unlocked');
  document.body.classList.add('is-locked');
  shell.classList.remove('is-ready');
  shell.inert = true;
  gate.removeAttribute('aria-hidden');
  gate.classList.remove('is-leaving');
  byId('password').value = '';
  byId('password').focus();
  if (counterTimer) clearInterval(counterTimer);
});

function renderWorld() {
  renderTimeline();
  renderGallery();
  renderVideos();
  renderLetters();
  renderPromise();
  renderDreams();
  startCounter();
  setupMusic();
  setupReveals();
}

function renderTimeline() {
  byId('timeline').innerHTML = memories.timeline.map((event, index) => `
    <article class="timeline-item reveal" data-sequence="${Math.min(index, 4)}">
      <span class="timeline-node" aria-hidden="true"></span>
      <div class="timeline-card">
        <div class="timeline-info"><time>${escapeHtml(event.date)}</time><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.description)}</p></div>
        <img class="timeline-image" src="${mediaUrl(event.image)}" alt="${escapeHtml(event.title)}" loading="lazy">
        <button class="timeline-open" type="button" data-timeline="${index}" aria-label="افتحي ذكرى: ${escapeHtml(event.title)}"></button>
      </div>
    </article>`).join('');
  byId('timeline').addEventListener('click', (event) => {
    const button = event.target.closest('[data-timeline]');
    if (button) openTimeline(Number(button.dataset.timeline));
  });
}

function renderGallery() {
  const categories = ['الكل', ...new Set(memories.photos.map((photo) => photo.category))];
  const filters = byId('gallery-filters');
  filters.innerHTML = categories.map((category, index) => `<button class="filter-chip${index === 0 ? ' active' : ''}" type="button" data-filter="${escapeHtml(category)}" aria-pressed="${index === 0}">${escapeHtml(category)}</button>`).join('');
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    filters.querySelectorAll('.filter-chip').forEach((chip) => {
      const active = chip === button;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    renderPhotoCards(button.dataset.filter);
  });
  renderPhotoCards('الكل');
}

function renderPhotoCards(filter) {
  const photos = memories.photos.filter((photo) => filter === 'الكل' || photo.category === filter);
  visiblePhotoIndexes = photos.map((photo) => memories.photos.indexOf(photo));
  byId('gallery-grid').innerHTML = photos.map((photo) => {
    const index = memories.photos.indexOf(photo);
    return `<button class="photo-card reveal" type="button" data-photo="${index}" aria-label="افتحي صورة ${escapeHtml(photo.title)}، ${escapeHtml(photo.date)}">
      <img src="${mediaUrl(photo.image)}" alt="${escapeHtml(photo.title)}" loading="lazy">
      <span class="photo-caption"><span><strong>${escapeHtml(photo.title)}</strong><small>${escapeHtml(photo.date)}</small></span><i aria-hidden="true">↖</i></span>
    </button>`;
  }).join('');
  byId('gallery-grid').querySelectorAll('[data-photo]').forEach((button) => button.addEventListener('click', () => openLightbox(Number(button.dataset.photo))));
  setupReveals();
}

function renderVideos() {
  const count = memories.videos.length;
  byId('video-count').textContent = `${arabicNumber(count)} ${count === 1 ? 'مقطع' : 'مقاطع'}`;
  const grid = byId('video-grid');
  if (!count) {
    grid.innerHTML = `<div class="video-empty"><span>ستجدين هنا مقاطعنا الصغيرة، حين نضيفها إلى ألبوم الذكريات.</span><span class="video-empty-mark" aria-hidden="true">▷</span></div>`;
    return;
  }
  grid.innerHTML = memories.videos.map((video, index) => `<button class="video-card reveal" type="button" data-video="${index}">
    <span class="video-poster"><img src="${mediaUrl(video.poster)}" alt="" loading="lazy"><span class="play-mark" aria-hidden="true">▷</span></span>
    <span class="video-meta"><strong>${escapeHtml(video.title)}</strong><small>${escapeHtml(video.date)} · ${escapeHtml(video.description)}</small></span>
  </button>`).join('');
  grid.querySelectorAll('[data-video]').forEach((button) => button.addEventListener('click', () => openVideo(Number(button.dataset.video))));
}

function renderLetters() {
  byId('letters-grid').innerHTML = memories.letters.map((letter, index) => `
    <button class="letter-card reveal" type="button" data-letter="${index}" aria-label="افتحي رسالة: ${escapeHtml(letter.title)}">
      <span class="letter-top"><span>${escapeHtml(letter.date)}</span><span class="letter-index">${arabicNumber(index + 1)}</span></span>
      <span class="envelope-scene" aria-hidden="true"><span class="envelope"><i class="envelope-back"></i><i class="envelope-paper"></i><i class="envelope-flap"></i><i class="envelope-front"></i><i class="heart-seal">♡</i></span></span>
      <h3>${escapeHtml(letter.title)}</h3><p>رسالةٌ صغيرة، من قلبٍ يحبّكِ</p>
    </button>`).join('');
  byId('letters-grid').querySelectorAll('[data-letter]').forEach((button) => button.addEventListener('click', () => openLetter(Number(button.dataset.letter))));
}

function renderPromise() {
  const text = 'في الأيام التي تضحكين فيها، وفي الأيام التي لا تعرفين فيها كيف تبتسمين.\n\nفي لحظات القوة، وفي لحظات التعب.\n\nلن تكوني مضطرة لمواجهة كل شيء وحدكِ، وسأظل أتمنى أن أكون لكِ الأمان والطمأنينة.\n\nفبعض الأشخاص لا نريدهم فقط في اللحظات الجميلة، بل نريد أن نبقى بجانبهم في كل الفصول.';
  const paragraph = byId('promise-copy');
  paragraph.textContent = text;
  paragraph.setAttribute('aria-label', text.replaceAll('\n', ' '));
  paragraph.innerHTML = text.split(/(\s+)/).map((part) => part.trim() ? `<span class="promise-word">${escapeHtml(part)}</span>` : part).join('');
}

function getDreams() {
  if (!dreamItems.length) {
    try {
      const saved = JSON.parse(sessionStorage.getItem('hikayatuna-dreams') || '[]');
      dreamItems = [...memories.dreams, ...saved];
    } catch { dreamItems = [...memories.dreams]; }
  }
  return dreamItems;
}

function persistDreams() {
  const extras = dreamItems.slice(memories.dreams.length);
  try { sessionStorage.setItem('hikayatuna-dreams', JSON.stringify(extras)); } catch { showToast('تعذّر حفظ الحلم على هذا الجهاز.'); }
}

function renderDreams() {
  byId('dreams-grid').innerHTML = getDreams().map((dream, index) => `
    <button class="dream-card reveal${dream.done ? ' done' : ''}" type="button" data-dream="${index}" aria-label="${dream.done ? 'حلمٌ تحقق: ' : 'افتحي الحلم: '}${escapeHtml(dream.title)}">
      <span class="dream-symbol" aria-hidden="true">${escapeHtml(dream.icon || '✧')}</span><h3>${escapeHtml(dream.title)}</h3><p>${escapeHtml(dream.detail)}</p>
    </button>`).join('');
  byId('dreams-grid').querySelectorAll('[data-dream]').forEach((button) => button.addEventListener('click', () => openDream(Number(button.dataset.dream))));
  setupReveals();
}

function startCounter() {
  const start = new Date(memories.relationshipStart).getTime();
  if (!Number.isFinite(start)) return;
  const update = () => {
    const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    byId('days').textContent = arabicNumber(Math.floor(seconds / 86400));
    byId('hours').textContent = arabicNumber(Math.floor(seconds / 3600) % 24).padStart(2, '٠');
    byId('minutes').textContent = arabicNumber(Math.floor(seconds / 60) % 60).padStart(2, '٠');
    byId('seconds').textContent = arabicNumber(seconds % 60).padStart(2, '٠');
  };
  update();
  counterTimer = setInterval(update, 1000);
}

function setupReveals() {
  const targets = document.querySelectorAll('.site-shell .reveal:not([data-observed])');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((item) => { item.classList.add('is-visible'); item.dataset.observed = 'true'; });
    return;
  }
  const observer = new IntersectionObserver((entries, self) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      entry.target.dataset.observed = 'true';
      self.unobserve(entry.target);
    });
  }, { threshold: 0.13, rootMargin: '0px 0px -30px 0px' });
  targets.forEach((item) => observer.observe(item));
}

function openModal(markup, initialFocus = '.modal-close') {
  lastFocused = document.activeElement;
  modalLayer.innerHTML = markup;
  modalLayer.classList.add('is-open');
  modalLayer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const close = modalLayer.querySelector(initialFocus);
  if (close) setTimeout(() => close.focus(), 25);
}

function closeModal() {
  if (!modalLayer.classList.contains('is-open')) return;
  const video = modalLayer.querySelector('video');
  if (video) video.pause();
  modalLayer.classList.remove('is-open');
  modalLayer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  setTimeout(() => { modalLayer.innerHTML = ''; if (lastFocused && lastFocused.isConnected) lastFocused.focus(); }, 180);
}

modalLayer.addEventListener('click', (event) => {
  if (event.target === modalLayer || event.target.closest('[data-close-modal]')) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
  if (modalLayer.classList.contains('is-open') && event.key === 'Tab') {
    const elements = [...modalLayer.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),video[controls]')];
    if (!elements.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

function openTimeline(index) {
  const item = memories.timeline[index];
  openModal(`<article class="modal-dialog timeline-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(item.title)}">
    <button class="modal-close" type="button" data-close-modal aria-label="أغلقي النافذة">×</button>
    <img src="${mediaUrl(item.image)}" alt="${escapeHtml(item.title)}"><div><time>${escapeHtml(item.date)}</time><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.description)}</p></div>
  </article>`);
}

function openLightbox(index) {
  currentPhotoIndex = index;
  drawLightbox();
  openModal(modalLayer.innerHTML);
  wireLightbox();
}

function drawLightbox() {
  const photo = memories.photos[currentPhotoIndex];
  const position = visiblePhotoIndexes.indexOf(currentPhotoIndex);
  const photoCount = visiblePhotoIndexes.length || memories.photos.length;
  const markup = `<article class="modal-dialog lightbox" role="dialog" aria-modal="true" aria-label="${escapeHtml(photo.title)}">
    <button class="modal-close" type="button" data-close-modal aria-label="أغلقي الصورة">×</button>
    <div class="lightbox-image-wrap"><img src="${mediaUrl(photo.image)}" alt="${escapeHtml(photo.title)}"></div>
    <div class="lightbox-side"><span class="eyebrow">من صندوق ذكرياتنا</span><h2>${escapeHtml(photo.title)}</h2><time>${escapeHtml(photo.date)}</time><p>${escapeHtml(photo.description)}</p>
      <div class="lightbox-controls"><button type="button" data-lightbox="prev" aria-label="الصورة السابقة">→</button><span>${arabicNumber(position >= 0 ? position + 1 : currentPhotoIndex + 1)} / ${arabicNumber(photoCount)}</span><button type="button" data-lightbox="next" aria-label="الصورة التالية">←</button></div>
      <div class="photo-letter"><button class="letter-reveal-button" type="button" data-photo-letter aria-expanded="false"><span class="mini-envelope" aria-hidden="true"><i class="mini-envelope-back"></i><i class="mini-envelope-paper"></i><i class="mini-envelope-flap"></i><i class="mini-envelope-front"></i><i class="mini-envelope-seal">♡</i></span><span>افتحي رسالة الذكرى</span></button><div class="mini-letter" id="mini-letter"></div></div>
    </div></article>`;
  if (modalLayer.classList.contains('is-open')) {
    modalLayer.innerHTML = markup;
    wireLightbox();
  } else {
    modalLayer.innerHTML = markup;
  }
}

function wireLightbox() {
  modalLayer.querySelector('[data-lightbox="prev"]').addEventListener('click', () => moveLightbox(-1));
  modalLayer.querySelector('[data-lightbox="next"]').addEventListener('click', () => moveLightbox(1));
  modalLayer.querySelector('[data-photo-letter]').addEventListener('click', (event) => {
    const letter = modalLayer.querySelector('#mini-letter');
    letter.textContent = memories.photos[currentPhotoIndex].letter;
    letter.classList.add('is-open');
    modalLayer.querySelector('.photo-letter').classList.add('is-open');
    event.currentTarget.setAttribute('aria-expanded', 'true');
    letter.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}

function moveLightbox(step) {
  const indexes = visiblePhotoIndexes.length ? visiblePhotoIndexes : memories.photos.map((_, index) => index);
  const position = Math.max(0, indexes.indexOf(currentPhotoIndex));
  const nextPosition = (position + step + indexes.length) % indexes.length;
  currentPhotoIndex = indexes[nextPosition];
  drawLightbox();
}

function openLetter(index) {
  const letter = memories.letters[index];
  openModal(`<article class="modal-dialog letter-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(letter.title)}">
    <button class="modal-close" type="button" data-close-modal aria-label="أغلقي الرسالة">×</button>
    <span class="eyebrow">رسالةٌ من حكايتنا</span><div class="envelope-scene" aria-hidden="true"><span class="envelope is-opening"><i class="envelope-back"></i><i class="envelope-paper"></i><i class="envelope-flap"></i><i class="envelope-front"></i><i class="heart-seal">♡</i></span></div><h2>${escapeHtml(letter.title)}</h2><time>${escapeHtml(letter.date)}</time><p>${escapeHtml(letter.text)}</p>
  </article>`);
}

function openDream(index) {
  const dream = getDreams()[index];
  openModal(`<article class="modal-dialog dream-modal" role="dialog" aria-modal="true" aria-labelledby="dream-title">
    <button class="modal-close" type="button" data-close-modal aria-label="أغلقي النافذة">×</button><span class="eyebrow">فصلٌ ننتظره</span><h2 id="dream-title">${escapeHtml(dream.title)}</h2><p>${escapeHtml(dream.detail)}</p>
    <div class="dream-actions"><button class="button button-dark" type="button" data-dream-done="${index}">${dream.done ? 'أعيدي الحلم إلى قائمتنا' : 'تحقق هذا الحلم'}</button><button class="button modal-secondary" type="button" data-close-modal>أغلقي النافذة</button></div>
  </article>`);
  modalLayer.querySelector('[data-dream-done]').addEventListener('click', (event) => {
    const item = dreamItems[Number(event.currentTarget.dataset.dreamDone)];
    item.done = !item.done;
    persistDreams();
    renderDreams();
    closeModal();
    showToast(item.done ? 'حلمٌ جميل أصبح ذكرى نعتز بها.' : 'عاد الحلم إلى قائمة أمنياتنا.');
  });
}

byId('add-dream').addEventListener('click', () => {
  openModal(`<article class="modal-dialog dream-modal" role="dialog" aria-modal="true" aria-labelledby="new-dream-title">
    <button class="modal-close" type="button" data-close-modal aria-label="أغلقي النافذة">×</button><span class="eyebrow">فكرةٌ نحتفظ بها معاً</span><h2 id="new-dream-title">أضيفي حلماً جديداً</h2>
    <form class="dream-form" id="dream-form"><label>اسم الحلم<input name="title" maxlength="55" required placeholder="ما الذي نودّ أن نعيشه؟"></label><label>تفصيلٌ صغير عنه<textarea name="detail" maxlength="180" required placeholder="اكتبي ما يجعل هذا الحلم لنا... "></textarea></label><button class="button button-dark" type="submit">احتفظي به في أحلامنا</button></form>
  </article>`, '.dream-form input');
  modalLayer.querySelector('#dream-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    dreamItems.push({ title: String(data.get('title')).trim(), detail: String(data.get('detail')).trim(), icon: '✧', done: false });
    persistDreams();
    renderDreams();
    closeModal();
    showToast('حُفظ حلمٌ جديد في حكايتنا.');
  });
});

function openVideo(index) {
  const video = memories.videos[index];
  openModal(`<article class="modal-dialog video-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(video.title)}">
    <button class="modal-close" type="button" data-close-modal aria-label="أغلقي المقطع">×</button><video src="${mediaUrl(video.src, 'video')}" poster="${mediaUrl(video.poster)}" controls playsinline preload="metadata"></video>
    <h2>${escapeHtml(video.title)}</h2><p>${escapeHtml(video.date)} · ${escapeHtml(video.description)}</p>
  </article>`);
  const player = modalLayer.querySelector('video');
  player.play().catch(() => {});
}

byId('surprise-button').addEventListener('click', () => {
  const index = Math.floor(Math.random() * memories.photos.length);
  const photo = memories.photos[index];
  openModal(`<article class="modal-dialog surprise-modal" role="dialog" aria-modal="true" aria-label="ذكرى من أيامنا">
    <button class="modal-close" type="button" data-close-modal aria-label="أغلقي الذكرى">×</button>
    <div class="surprise-photo"><img src="${mediaUrl(photo.image)}" alt="${escapeHtml(photo.title)}"></div>
    <div class="surprise-copy"><span class="eyebrow">من صندوقٍ لم نفتحه منذ مدة</span><h2>${escapeHtml(photo.title)}</h2><time>${escapeHtml(photo.date)}</time><p>${escapeHtml(photo.description)}</p>
      <button class="letter-reveal-button" type="button" data-surprise-letter>♡ افتحي رسالتها</button><div class="mini-letter" id="surprise-letter"></div>
    </div></article>`);
  modalLayer.querySelector('[data-surprise-letter]').addEventListener('click', () => {
    const letter = modalLayer.querySelector('#surprise-letter');
    letter.textContent = photo.letter;
    letter.classList.add('is-open');
    letter.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
});

document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}));

function setupMusic() {
  if (!memories.music?.src) return;
  const audio = byId('background-audio');
  const button = byId('music-toggle');
  audio.src = mediaUrl(memories.music.src, 'music');
  button.hidden = false;
  const savedVolumeValue = sessionStorage.getItem('hikayatuna-volume');
  const savedVolume = savedVolumeValue === null ? NaN : Number(savedVolumeValue);
  audio.volume = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.65;
  const preference = sessionStorage.getItem('hikayatuna-music');
  button.setAttribute('aria-label', preference === 'playing' ? 'تشغيل لحن حكايتنا الذي اخترتِه' : 'تشغيل لحن حكايتنا');
  button.onclick = async () => {
    document.querySelector('.music-volume')?.classList.add('is-visible');
    if (audio.paused) {
      try {
        await audio.play();
        button.classList.add('is-playing');
        button.setAttribute('aria-label', 'إيقاف لحن حكايتنا');
        sessionStorage.setItem('hikayatuna-music', 'playing');
      } catch { showToast('لم نتمكن من تشغيل اللحن الآن.'); }
    } else {
      audio.pause();
      button.classList.remove('is-playing');
      button.setAttribute('aria-label', 'تشغيل لحن حكايتنا');
      sessionStorage.setItem('hikayatuna-music', 'paused');
    }
  };
  document.querySelector('.music-volume')?.remove();
  const volume = document.createElement('label');
  volume.className = 'music-volume';
  volume.innerHTML = `<span>مستوى الصوت</span><input type="range" min="0" max="1" step="0.05" value="${audio.volume}" aria-label="مستوى صوت اللحن">`;
  document.body.append(volume);
  button.onpointerenter = () => volume.classList.add('is-visible');
  button.onfocus = () => volume.classList.add('is-visible');
  button.onblur = () => setTimeout(() => { if (!volume.contains(document.activeElement)) volume.classList.remove('is-visible'); }, 150);
  button.onpointerleave = () => setTimeout(() => { if (!volume.matches(':hover') && !volume.contains(document.activeElement)) volume.classList.remove('is-visible'); }, 180);
  volume.onpointerleave = () => { if (!button.matches(':hover')) volume.classList.remove('is-visible'); };
  volume.querySelector('input').addEventListener('input', (event) => {
    audio.volume = Number(event.currentTarget.value);
    sessionStorage.setItem('hikayatuna-volume', String(audio.volume));
  });
}

document.addEventListener('keydown', (event) => {
  if (!modalLayer.classList.contains('is-open')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (!modalLayer.querySelector('.lightbox')) return;
    moveLightbox(event.key === 'ArrowLeft' ? 1 : -1);
  }
});

checkExistingSession();
