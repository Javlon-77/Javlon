(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('editor'), originalPrompt = $('prompt'), originalSend = $('sendBtn'), messages = $('messages');
  if (!editor || !originalPrompt || !originalSend) return;

  const getText = () => String(editor.innerText || editor.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const pushMessage = (text, role = 'ai') => {
    if (!messages || !text) return;
    const el = document.createElement('div');
    el.className = `bubble ${role}`;
    el.textContent = String(text);
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  };

  const refreshStats = () => {
    const t = getText();
    const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
    const chars = t.length;
    const mins = words ? Math.max(1, Math.ceil(words / 180)) : 0;
    const score = words ? Math.min(100, Math.round(
      Math.min(45, words / 7) +
      Math.min(25, new Set(t.toLowerCase().split(/\s+/)).size / 3) +
      Math.min(20, (t.match(/[.!?]/g) || []).length * 1.5) + 10
    )) : 0;
    const set = (id, value) => { if ($(id)) $(id).textContent = value; };
    set('wordCount', `${words} so‘z`);
    set('charCount', `${chars} belgi`);
    set('readTime', `${mins} daqiqa o‘qish`);
    set('wordCountSide', words);
    set('charCountSide', chars);
    set('readTimeSide', mins);
    set('scoreValue', `${score}/100`);
    if ($('scoreBar')) $('scoreBar').style.width = `${score}%`;
  };

  const applyEdit = html => {
    editor.innerHTML = html;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    refreshStats();
  };

  const currentTitle = () => ($('docTitle')?.textContent || 'hujjat').trim();

  const localAI = query => {
    const q = String(query || '').trim();
    const l = q.toLowerCase();
    const t = getText();

    if (/^salom$|^hello$|^hi$/.test(l)) return { answer: 'Salom! 👋' };

    if (!t) {
      if (/xulosa|summary|mazmun|imlo|grammatik|xato|qisqartir|shorten|professional|rasmiy|formal|kirish|intro|yakun|conclusion|kengaytir|expand|diagram|diagramma|jadval|table/.test(l)) {
        return { answer: 'Matn hali bo‘sh. Avval hujjat oynasiga matn yozing.' };
      }
      return { answer: 'Xabaringiz qabul qilindi.' };
    }

    if (/xulosa|summary|mazmun/.test(l)) {
      const parts = t.split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 6);
      return { answer: '📌 Qisqa mazmun\n' + parts.map(x => '• ' + (x.length > 180 ? x.slice(0, 177) + '…' : x)).join('\n') };
    }

    if (/imlo|grammatik|xato|spell/.test(l)) {
      const fixed = t
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.!?;:])/g, '$1')
        .replace(/\bmenham\b/gi, 'men ham')
        .replace(/\bO'zbekiston\b/g, 'O‘zbekiston');
      return fixed === t
        ? { answer: '✅ Oddiy imlo xatosi topilmadi.' }
        : { answer: '✅ Imlo va bo‘sh joy xatolarini tuzatdim.', edit: fixed };
    }

    if (/qisqartir|shorten|40 foiz|short/.test(l)) {
      const parts = t.split(/\n+/).map(x => x.trim()).filter(Boolean);
      const n = Math.max(1, Math.ceil(parts.length * 0.6));
      return { answer: '↘ Matn qisqartirildi.', edit: parts.slice(0, n).map(x => x.length > 240 ? x.slice(0, 237) + '…' : x).join('\n') };
    }

    if (/professional|rasmiy|formal/.test(l)) {
      const fixed = t.split(/\n+/).map(x => x.trim()).filter(Boolean).map((x, i) =>
        i === 0 ? x : x.replace(/^men /i, 'Mazkur hujjat doirasida men ').replace(/^biz /i, 'Jamoamiz ')
      ).join('\n\n');
      return { answer: '✦ Matn professional uslubga o‘tkazildi.', edit: fixed };
    }

    if (/kirish|intro/.test(l)) {
      return { answer: '＋ Kirish qismi qo‘shildi.', prepend: `Kirish\n\n${currentTitle()} mavzusi bugungi kunda muhim yo‘nalishlardan biridir. Ushbu hujjatda mavzuning asosiy jihatlari, amaliy ahamiyati va muhim xulosalari yoritiladi.` };
    }

    if (/yakun|conclusion/.test(l)) {
      return { answer: '✓ Yakun qismi qo‘shildi.', append: `Xulosa\n\nYakun qilib aytganda, ${currentTitle().toLowerCase()} bo‘yicha keltirilgan fikrlar amaliy jihatdan muhimdir. Ushbu ma’lumotlar asosida aniq xulosa chiqarish mumkin.` };
    }

    if (/kengaytir|expand|batafsil/.test(l)) {
      return { answer: '＋ Matn kengaytirildi.', append: 'Qo‘shimcha izoh: mavzuni amaliy misollar, aniq dalillar va ketma-ket qadamlar bilan yoritish tushunarlilikni oshiradi.' };
    }

    if (/diagram|diagramma|jadval|table/.test(l)) {
      const box = document.createElement('div');
      box.className = 'matrix-diagram';
      box.innerHTML = '<div class="matrix-title" contenteditable="true">Mavzu jadvali</div><div class="matrix-subtitle">Tahrirlash uchun katakka bosing</div><table class="matrix-table"><tr><th>Bo‘lim</th><th>Ma’lumot</th><th>Holat</th></tr><tr><th>Asosiy fikr</th><td contenteditable="true"></td><td contenteditable="true">Tayyor</td></tr><tr><th>Maqsad</th><td contenteditable="true">Tushuntirish</td><td contenteditable="true">Faol</td></tr></table>';
      const firstCell = box.querySelector('td');
      if (firstCell) firstCell.textContent = t.slice(0, 160);
      editor.appendChild(box);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      refreshStats();
      return { answer: '▦ Tahrirlanadigan jadval qo‘shildi.' };
    }

    return { answer: 'Tushundim. Hujjat matni bilan ishlashga tayyorman.' };
  };

  const prompt = originalPrompt.cloneNode(true);
  const send = originalSend.cloneNode(true);
  originalPrompt.replaceWith(prompt);
  originalSend.replaceWith(send);

  const submit = () => {
    const q = String(prompt.value || '').trim();
    if (!q) return;
    pushMessage(q, 'user');
    prompt.value = '';
    send.disabled = true;
    try {
      const result = localAI(q);
      if (result.prepend) editor.insertAdjacentText('afterbegin', result.prepend + '\n\n');
      if (result.append) editor.insertAdjacentText('beforeend', '\n\n' + result.append);
      if (result.edit !== undefined) applyEdit(result.edit);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      refreshStats();
      if (result.answer) pushMessage(result.answer);
    } catch (err) {
      pushMessage('Xatolik yuz berdi: ' + (err?.message || 'noma’lum xato'));
    } finally {
      send.disabled = false;
    }
  };

  send.addEventListener('click', e => { e.preventDefault(); submit(); });
  prompt.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  document.querySelectorAll('#suggestions [data-prompt]').forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    clone.addEventListener('click', e => {
      e.preventDefault();
      prompt.value = clone.dataset.prompt || '';
      submit();
    });
  });

  const welcome = document.querySelector('.welcome-bubble');
  if (welcome) welcome.textContent = 'Salom! 👋';
  const heroBadge = document.querySelector('.hero-badge');
  if (heroBadge) heroBadge.textContent = 'AI WORD STUDIO';
  const heroText = document.querySelector('.ai-hero p');
  if (heroText) heroText.textContent = 'Matn yozing, savol bering yoki tayyor amallardan foydalaning.';
  const chatSub = document.querySelector('.chat-sub');
  if (chatSub) chatSub.innerHTML = '<span class="online-dot"></span> Tayyor · Hujjatni tushunadi';
  const profileSub = document.querySelector('.profile-copy span');
  if (profileSub) profileSub.textContent = 'AI Word Studio';

  refreshStats();
})();
