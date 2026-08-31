/* global ethers, CATBOX_CHAIN, CATBOX_SICBO, CatboxChain */
(function () {
  const LIM_ADDR = "0x1D6430FDFC63ea481fE157017B47530663C96001";
  const UNIT = 10n ** 18n;
  const MIN_STAKE = 1;
  const MAX_STAKE = 10;
  const COPY = {
    zh: {
      sub: "提现桌 · 1–10 LIM 自选",
      mode: "先选注额，点小或大锁注。等两个块，再点揭盅。押中双倍回钱包。",
      kicker: "提现桌",
      small: "小",
      big: "大",
      smallMeta: "4–8 · 开双倍",
      bigMeta: "13–17 · 开双倍",
      open: "揭盅",
      next: "再来一盅",
      opening: "揭盅中，请在钱包确认…",
      wait: "已锁。再等 {n} 个块，再点揭盅。",
      waitReady: "可以揭盅了。点揭盅，在钱包确认。",
      r1: "自选 1–10 LIM 开一盅。押中即双倍回钱包。",
      r2: "押小开 4–8，押大开 13–17。中门与围骰充实奖池。",
      r3: "216 种点数里，54 面开双倍。",
      r4: "独立奖池。锁注后等两个块，再点揭盅。未揭的注，回来还能继续。",
      r5: "桌池每周销毁约两成。未揭的注不烧。",
      r6: "开盅由合约自动执行，不人为改点。不进日榜、邀请榜、底池。",
      win: "开中了。{n} LIM 已到钱包。",
      loseMid: "中门入池，再来一盅。",
      loseTriple: "围骰入池，再来一盅。",
      lose: "这盅未开，再摇一把。",
      needWallet: "先连接钱包。",
      needBsc: "请切到 BSC。",
      noPool: "奖池正在补仓，稍后再开。",
      needLim: "钱包 LIM 不够这一注。",
      paying: "下注 {n} LIM，请在钱包确认…",
      approve: "先授权 LIM，请在钱包确认…",
      refund: "超时，本金已退回。",
      total: "总和 {n}",
      bal: "LIM {lim} · 奖池 {pool}",
      shaking: "摇盅…",
      stakeLabel: "本盅注额",
      rejected: "已取消。未揭的注点「揭盅」继续。",
      hasOpen: "这一盅还没揭。点揭盅。",
      paused: "桌子暂停中。",
      resume: "你有一盅未揭。",
      ok: "好",
    },
    en: {
      sub: "TABLE · 1–10 LIM",
      mode: "Pick a stake, then Small or Big to lock. Wait two blocks, then tap OPEN CUP. A hit pays double.",
      kicker: "TABLE",
      small: "SMALL",
      big: "BIG",
      smallMeta: "4–8 · pays double",
      bigMeta: "13–17 · pays double",
      open: "OPEN CUP",
      next: "AGAIN",
      opening: "Opening — confirm in wallet…",
      wait: "Locked. {n} blocks, then tap OPEN CUP.",
      waitReady: "Ready. Tap OPEN CUP and confirm in the wallet.",
      r1: "Pick 1–10 LIM per cup. A hit returns double to your wallet.",
      r2: "Small opens 4–8. Big opens 13–17. Middle and triples refill the pool.",
      r3: "54 of 216 faces pay double.",
      r4: "Own pool. After lock, wait two blocks, then tap OPEN CUP. An open cup can be finished later.",
      r5: "Each week about 20% of the table pool is burned. Open cups are not burned.",
      r6: "The contract opens the cup. Nobody sets the points. Not the daily board, invite board, or floor.",
      win: "Hit. {n} LIM is in the wallet.",
      loseMid: "Middle refill. Open another cup.",
      loseTriple: "Triple refill. Open another cup.",
      lose: "This cup passed. Shake again.",
      needWallet: "Connect wallet first.",
      needBsc: "Switch to BSC.",
      noPool: "Table is restocking. Try later.",
      needLim: "Not enough LIM for this stake.",
      paying: "Betting {n} LIM — confirm in wallet…",
      approve: "Approve LIM in wallet…",
      refund: "Timed out. Stake returned.",
      total: "TOTAL {n}",
      bal: "LIM {lim} · POOL {pool}",
      shaking: "SHAKING…",
      stakeLabel: "STAKE",
      rejected: "Cancelled. Tap OPEN CUP if a cup is still waiting.",
      hasOpen: "This cup is still open. Open it.",
      paused: "Table is paused.",
      resume: "You have an open cup.",
      ok: "OK",
    },
    ja: {
      sub: "出金卓 · 1–10 LIM",
      mode: "額を選んで小か大でロック。2ブロック待ってから開く。当たれば倍がウォレットへ。",
      kicker: "出金卓",
      small: "小",
      big: "大",
      smallMeta: "4–8 · 倍",
      bigMeta: "13–17 · 倍",
      open: "開く",
      next: "もう一回",
      opening: "開封中。ウォレットで確認…",
      wait: "ロック済み。あと {n} ブロック、それから開く。",
      waitReady: "開ける。ウォレットで確認。",
      r1: "1–10 LIM で一回。当たれば倍がウォレットへ。",
      r2: "小は 4–8、大は 13–17。中間とゾロ目はプールへ。",
      r3: "216 面のうち 54 面が倍。",
      r4: "独立プール。ロック後 2 ブロック待って開く。未開封は後から続けられる。",
      r5: "卓プールは毎週およそ2割をバーン。未開封の賭けは焼かない。",
      r6: "開封はコントラクトが自動実行。人が目を決めない。日次・招待・フロアプールには入らない。",
      win: "当たり。{n} LIM がウォレットへ。",
      loseMid: "中間はプールへ。もう一回。",
      loseTriple: "ゾロ目はプールへ。もう一回。",
      lose: "外れ。もう一振り。",
      needWallet: "先にウォレット接続。",
      needBsc: "BSC に切り替えて。",
      noPool: "プール補充中。少し待って。",
      needLim: "この額の LIM が足りない。",
      paying: "{n} LIM をロック。ウォレットで確認…",
      approve: "先に LIM を承認。ウォレットで確認…",
      refund: "時間切れ。元本は戻った。",
      total: "合計 {n}",
      bal: "LIM {lim} · プール {pool}",
      shaking: "シェイク…",
      stakeLabel: "この回の額",
      rejected: "キャンセル。未開封なら「開く」で続ける。",
      hasOpen: "まだ開いていない。開いて。",
      paused: "卓は一時停止中。",
      resume: "未開封の回がある。",
      ok: "OK",
    },
    ko: {
      sub: "출금 테이블 · 1–10 LIM",
      mode: "금액을 고르고 소 또는 대로 잠근다. 두 블록 기다린 뒤 컵을 연다. 맞히면 두 배가 지갑으로.",
      kicker: "출금 테이블",
      small: "소",
      big: "대",
      smallMeta: "4–8 · 두 배",
      bigMeta: "13–17 · 두 배",
      open: "컵 열기",
      next: "한 판 더",
      opening: "여는 중. 지갑에서 확인…",
      wait: "잠김. {n}블록 뒤 컵을 여세요.",
      waitReady: "열 수 있음. 컵 열기를 누르고 지갑에서 확인.",
      r1: "1–10 LIM으로 한 판. 맞히면 두 배가 지갑으로.",
      r2: "소는 4–8, 대는 13–17. 중간과 트리플은 풀로.",
      r3: "216면 중 54면이 두 배.",
      r4: "독립 풀. 잠근 뒤 두 블록 기다렸다가 연다. 안 연 판은 나중에 이어서.",
      r5: "테이블 풀은 매주 약 20% 소각. 안 연 판은 태우지 않음.",
      r6: "개봉은 컨트랙트가 자동 실행. 사람이 점을 바꾸지 않음. 일간·초대·베이스 풀에 안 들어감.",
      win: "적중. {n} LIM이 지갑으로.",
      loseMid: "중간은 풀로. 한 판 더.",
      loseTriple: "트리플은 풀로. 한 판 더.",
      lose: "이번 판은 빗나감. 다시 흔들기.",
      needWallet: "먼저 지갑을 연결하세요.",
      needBsc: "BSC로 전환하세요.",
      noPool: "풀 보충 중. 잠시 후.",
      needLim: "이 금액의 LIM이 부족합니다.",
      paying: "{n} LIM 잠금. 지갑에서 확인…",
      approve: "먼저 LIM 승인. 지갑에서 확인…",
      refund: "시간 초과. 원금이 돌아왔습니다.",
      total: "합 {n}",
      bal: "LIM {lim} · 풀 {pool}",
      shaking: "흔드는 중…",
      stakeLabel: "이번 판 금액",
      rejected: "취소됨. 안 연 판은 컵 열기로 이어가세요.",
      hasOpen: "아직 안 열었습니다. 컵을 여세요.",
      paused: "테이블이 일시정지되었습니다.",
      resume: "안 연 판이 있습니다.",
      ok: "확인",
    },
    vi: {
      sub: "BÀN RÚT · 1–10 LIM",
      mode: "Chọn mức, rồi Nhỏ hoặc Lớn để khóa. Đợi hai khối, rồi mở chén. Trúng thì gấp đôi về ví.",
      kicker: "BÀN RÚT",
      small: "NHỎ",
      big: "LỚN",
      smallMeta: "4–8 · gấp đôi",
      bigMeta: "13–17 · gấp đôi",
      open: "MỞ CHÉN",
      next: "LẮC LẠI",
      opening: "Đang mở — xác nhận trong ví…",
      wait: "Đã khóa. Còn {n} khối, rồi mở chén.",
      waitReady: "Mở được rồi. Bấm mở chén và xác nhận trong ví.",
      r1: "1–10 LIM mỗi chén. Trúng thì gấp đôi về ví.",
      r2: "Nhỏ ra 4–8. Lớn ra 13–17. Giữa và tam hoa vào quỹ.",
      r3: "54/216 mặt trả gấp đôi.",
      r4: "Quỹ riêng. Khóa xong đợi hai khối rồi mở. Chén chưa mở, quay lại vẫn làm tiếp.",
      r5: "Quỹ bàn đốt khoảng 20% mỗi tuần. Chén chưa mở không đốt.",
      r6: "Hợp đồng tự mở chén, không ai sửa điểm. Không vào bảng ngày, mời, hay quỹ nền.",
      win: "Trúng. {n} LIM đã vào ví.",
      loseMid: "Giữa vào quỹ. Lắc lại.",
      loseTriple: "Tam hoa vào quỹ. Lắc lại.",
      lose: "Chén này trượt. Lắc lại.",
      needWallet: "Hãy kết nối ví trước.",
      needBsc: "Chuyển sang BSC.",
      noPool: "Quỹ đang bổ sung. Thử lại sau.",
      needLim: "Không đủ LIM cho mức này.",
      paying: "Khóa {n} LIM — xác nhận trong ví…",
      approve: "Phê duyệt LIM trong ví…",
      refund: "Hết giờ. Gốc đã hoàn.",
      total: "TỔNG {n}",
      bal: "LIM {lim} · QUỸ {pool}",
      shaking: "ĐANG LẮC…",
      stakeLabel: "MỨC CHÉN NÀY",
      rejected: "Đã hủy. Chén chưa mở thì bấm MỞ CHÉN.",
      hasOpen: "Chén này chưa mở. Hãy mở.",
      paused: "Bàn đang tạm dừng.",
      resume: "Bạn còn một chén chưa mở.",
      ok: "OK",
    },
    th: {
      sub: "โต๊ะถอน · 1–10 LIM",
      mode: "เลือกยอด แล้วกดเล็กหรือใหญ่เพื่อล็อก รอสองบล็อก แล้วเปิดถ้วย ถูกได้สองเท่าเข้ากระเป๋า",
      kicker: "โต๊ะถอน",
      small: "เล็ก",
      big: "ใหญ่",
      smallMeta: "4–8 · สองเท่า",
      bigMeta: "13–17 · สองเท่า",
      open: "เปิดถ้วย",
      next: "เขย่าอีก",
      opening: "กำลังเปิด — ยืนยันในกระเป๋า…",
      wait: "ล็อกแล้ว เหลือ {n} บล็อก แล้วเปิดถ้วย",
      waitReady: "เปิดได้แล้ว กดเปิดถ้วยแล้วยืนยันในกระเป๋า",
      r1: "1–10 LIM ต่อถ้วย ถูกได้สองเท่าเข้ากระเป๋า",
      r2: "เล็กออก 4–8 ใหญ่ออก 13–17 กลางและตองเข้ากอง",
      r3: "54 จาก 216 หน้าจ่ายสองเท่า",
      r4: "กองของโต๊ะ ล็อกแล้วรอสองบล็อกแล้วเปิด ถ้วยที่ยังไม่เปิด กลับมาเปิดต่อได้",
      r5: "กองโต๊ะเผาประมาณสองส่วนในสิบทุกสัปดาห์ ถ้วยที่ยังไม่เปิดไม่เผา",
      r6: "สัญญาเปิดถ้วยเอง ไม่มีคนแก้แต้ม ไม่เข้ากระดานวัน ชวน หรือกองฐาน",
      win: "ถูก {n} LIM เข้ากระเป๋าแล้ว",
      loseMid: "กลางเข้ากอง เขย่าอีก",
      loseTriple: "ตองเข้ากอง เขย่าอีก",
      lose: "ถ้วยนี้ไม่ถูก เขย่าอีก",
      needWallet: "เชื่อมกระเป๋าก่อน",
      needBsc: "สลับไป BSC",
      noPool: "กองกำลังเติม ลองใหม่ภายหลัง",
      needLim: "LIM ไม่พอสำหรับยอดนี้",
      paying: "ล็อก {n} LIM — ยืนยันในกระเป๋า…",
      approve: "อนุมัติ LIM ในกระเป๋า…",
      refund: "หมดเวลา คืนเงินต้นแล้ว",
      total: "รวม {n}",
      bal: "LIM {lim} · กอง {pool}",
      shaking: "กำลังเขย่า…",
      stakeLabel: "ยอดถ้วยนี้",
      rejected: "ยกเลิกแล้ว ถ้าถ้วยยังไม่เปิด กดเปิดถ้วย",
      hasOpen: "ถ้วยนี้ยังไม่เปิด เปิดเลย",
      paused: "โต๊ะหยุดชั่วคราว",
      resume: "คุณมีถ้วยที่ยังไม่เปิด",
      ok: "ตกลง",
    },
    ru: {
      sub: "СТОЛ · 1–10 LIM",
      mode: "Выберите ставку, затем Малое или Большое. Два блока — и откройте чашу. Попадание платит вдвойне на кошелёк.",
      kicker: "СТОЛ",
      small: "МАЛОЕ",
      big: "БОЛЬШОЕ",
      smallMeta: "4–8 · ×2",
      bigMeta: "13–17 · ×2",
      open: "ОТКРЫТЬ",
      next: "ЕЩЁ РАЗ",
      opening: "Открытие — подтвердите в кошельке…",
      wait: "Закрыто. Ещё {n} блоков, затем ОТКРЫТЬ.",
      waitReady: "Можно открыть. Нажмите ОТКРЫТЬ и подтвердите в кошельке.",
      r1: "1–10 LIM за чашу. Попадание возвращает двойную сумму на кошелёк.",
      r2: "Малое: 4–8. Большое: 13–17. Середина и тройки идут в пул.",
      r3: "54 из 216 граней платят ×2.",
      r4: "Свой пул. После блокировки два блока, затем откройте. Неоткрытую чашу можно доиграть позже.",
      r5: "Около 20% пула стола сжигается каждую неделю. Неоткрытые чаши не сжигаются.",
      r6: "Контракт открывает чашу сам. Очки не задаёт человек. Не дневной, инвайт и не базовый пул.",
      win: "Попадание. {n} LIM на кошельке.",
      loseMid: "Середина в пул. Ещё раз.",
      loseTriple: "Тройка в пул. Ещё раз.",
      lose: "Эта чаша мимо. Тряхните снова.",
      needWallet: "Сначала подключите кошелёк.",
      needBsc: "Переключитесь на BSC.",
      noPool: "Пул пополняется. Позже.",
      needLim: "Не хватает LIM на эту ставку.",
      paying: "Блокировка {n} LIM — подтвердите в кошельке…",
      approve: "Разрешите LIM в кошельке…",
      refund: "Время вышло. Ставка возвращена.",
      total: "СУММА {n}",
      bal: "LIM {lim} · ПУЛ {pool}",
      shaking: "ТРЯСЁМ…",
      stakeLabel: "СТАВКА ЧАШИ",
      rejected: "Отменено. Если чаша ждёт — нажмите ОТКРЫТЬ.",
      hasOpen: "Эта чаша ещё не открыта. Откройте.",
      paused: "Стол на паузе.",
      resume: "У вас есть неоткрытая чаша.",
      ok: "ОК",
    },
    id: {
      sub: "MEJA TARIK · 1–10 LIM",
      mode: "Pilih taruhan, lalu Kecil atau Besar untuk kunci. Tunggu dua blok, lalu buka mangkuk. Kenai, dapat dobel ke dompet.",
      kicker: "MEJA TARIK",
      small: "KECIL",
      big: "BESAR",
      smallMeta: "4–8 · dobel",
      bigMeta: "13–17 · dobel",
      open: "BUKA MANGKUK",
      next: "GOYANG LAGI",
      opening: "Membuka — konfirmasi di dompet…",
      wait: "Terkunci. {n} blok lagi, lalu buka mangkuk.",
      waitReady: "Siap. Ketuk BUKA MANGKUK dan konfirmasi di dompet.",
      r1: "1–10 LIM per mangkuk. Kenai, dobel kembali ke dompet.",
      r2: "Kecil 4–8. Besar 13–17. Tengah dan triple masuk pool.",
      r3: "54 dari 216 muka membayar dobel.",
      r4: "Pool sendiri. Setelah kunci, tunggu dua blok, lalu buka. Mangkuk belum dibuka bisa dilanjut nanti.",
      r5: "Pool meja dibakar sekitar 20% tiap minggu. Mangkuk belum dibuka tidak dibakar.",
      r6: "Kontrak membuka mangkuk sendiri. Tidak ada yang mengatur mata. Bukan papan harian, undangan, atau pool dasar.",
      win: "Kenai. {n} LIM sudah di dompet.",
      loseMid: "Tengah masuk pool. Goyang lagi.",
      loseTriple: "Triple masuk pool. Goyang lagi.",
      lose: "Mangkuk ini miss. Goyang lagi.",
      needWallet: "Hubungkan dompet dulu.",
      needBsc: "Pindah ke BSC.",
      noPool: "Pool sedang diisi. Coba nanti.",
      needLim: "LIM tidak cukup untuk taruhan ini.",
      paying: "Mengunci {n} LIM — konfirmasi di dompet…",
      approve: "Setujui LIM di dompet…",
      refund: "Waktu habis. Pokok dikembalikan.",
      total: "JUMLAH {n}",
      bal: "LIM {lim} · POOL {pool}",
      shaking: "MENGGOYANG…",
      stakeLabel: "TARUHAN MANGKUK INI",
      rejected: "Dibatalkan. Jika mangkuk masih menunggu, ketuk BUKA MANGKUK.",
      hasOpen: "Mangkuk ini belum dibuka. Buka.",
      paused: "Meja sedang jeda.",
      resume: "Anda punya mangkuk yang belum dibuka.",
      ok: "OK",
    },
    fil: {
      sub: "MESA · 1–10 LIM",
      mode: "Pumili ng taya, tapos Maliit o Malaki para i-lock. Maghintay ng dalawang block, tapos buksan ang tasa. Tama, doble sa wallet.",
      kicker: "MESA",
      small: "MALIIT",
      big: "MALAKI",
      smallMeta: "4–8 · doble",
      bigMeta: "13–17 · doble",
      open: "BUKSAN",
      next: "ULIT",
      opening: "Binubuksan — kumpirmahin sa wallet…",
      wait: "Naka-lock. {n} block, tapos BUKSAN.",
      waitReady: "Pwede na. Pindutin ang BUKSAN at kumpirmahin sa wallet.",
      r1: "1–10 LIM bawat tasa. Tama, doble pabalik sa wallet.",
      r2: "Maliit: 4–8. Malaki: 13–17. Gitna at triple papunta sa pool.",
      r3: "54 sa 216 na mukha ang nagbabayad ng doble.",
      r4: "Sariling pool. Pagkatapos mag-lock, maghintay ng dalawang block, tapos buksan. Ang hindi pa nabubuksang tasa, puwedeng tapusin mamaya.",
      r5: "Humigit-kumulang 20% ng pool ng mesa ang sinusunog tuwing linggo. Hindi sinusunog ang hindi pa nabubuksang tasa.",
      r6: "Kontrata ang nagbubukas ng tasa. Walang tao na nagtatakda ng puntos. Hindi daily board, invite, o floor.",
      win: "Tama. {n} LIM nasa wallet na.",
      loseMid: "Gitna sa pool. Ulit.",
      loseTriple: "Triple sa pool. Ulit.",
      lose: "Hindi tama. Yugyog ulit.",
      needWallet: "Ikonekta muna ang wallet.",
      needBsc: "Lumipat sa BSC.",
      noPool: "Nire-restock ang mesa. Subukan mamaya.",
      needLim: "Kulang ang LIM para sa taya na ito.",
      paying: "Nagla-lock ng {n} LIM — kumpirmahin sa wallet…",
      approve: "I-approve ang LIM sa wallet…",
      refund: "Timeout. Naibalik ang taya.",
      total: "KABUUAN {n}",
      bal: "LIM {lim} · POOL {pool}",
      shaking: "NAGYUGYOG…",
      stakeLabel: "TAYA NG TASANG ITO",
      rejected: "Kinansela. Kung may hinihintay pang tasa, pindutin ang BUKSAN.",
      hasOpen: "Hindi pa nabubuksan ang tasang ito. Buksan.",
      paused: "Naka-pause ang mesa.",
      resume: "May tasang hindi pa nabubuksan.",
      ok: "OK",
    },
  };

  const root = () => document.getElementById("sbRoot");
  const $ = (id) => document.getElementById(id);
  const diceEls = () => [...( $("sbDice")?.querySelectorAll(".die") || [])];

  let lang = "zh";
  let account = null;
  let busy = false;
  let spinning = false;
  let pendingLock = 0;
  let pendingSide = 0;
  let pendingStake = 0;
  let stakeLim = 1;
  let phase = "edit";
  let lastOutcome = null;

  function dashMode() {
    return Boolean(window.CatboxChain && $("lobby") && $("sbFelt"));
  }
  function syncLang() {
    lang = COPY[document.body.dataset.lang] ? document.body.dataset.lang : "en";
  }
  const t = (k, vars = {}) => {
    syncLang();
    let s = (COPY[lang] || COPY.zh)[k] || COPY.en[k] || k;
    Object.entries(vars).forEach(([a, v]) => {
      s = s.replaceAll(`{${a}}`, String(v));
    });
    return s;
  };
  function setTxt(id, v) {
    const el = $(id);
    if (el) el.textContent = v;
  }
  function setStatus(msg) {
    setTxt("sbStatus", msg || "");
  }
  function toast(msg) {
    const el = $("toast");
    if (!el || !msg) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
  }
  function paintPhase() {
    const page = root();
    if (!page) return;
    const waiting = phase === "wait" || pendingLock > 0;
    page.setAttribute("data-pending", waiting ? "1" : "0");
    page.setAttribute("data-result", phase === "result" ? "1" : "0");
    page.setAttribute("data-locked", busy || waiting || phase === "result" ? "1" : "0");
    const label = phase === "result" ? "next" : busy && waiting ? "opening" : "open";
    setTxt("sbOpen", t(label));
  }
  function applyCopy() {
    syncLang();
    setTxt("sbSub", t("sub"));
    setTxt("sbKicker", t("kicker"));
    setTxt("sbSmallTitle", t("small"));
    setTxt("sbBigTitle", t("big"));
    setTxt("sbSmallMeta", t("smallMeta"));
    setTxt("sbBigMeta", t("bigMeta"));
    setTxt("sbOpen", t("open"));
    setTxt("sbR1", t("r1"));
    setTxt("sbR2", t("r2"));
    setTxt("sbR3", t("r3"));
    setTxt("sbR4", t("r4"));
    setTxt("sbR5", t("r5"));
    setTxt("sbR6", t("r6"));
    setTxt("sbMode", t("mode"));
    setTxt("sbStake", t("stakeLabel"));
    setTxt("sbPopOk", t("ok"));
    paintPhase();
    paintOutcome();
  }
  function friendly(e) {
    const code = e?.code;
    const raw = String(e?.shortMessage || e?.reason || e?.message || e || "");
    const low = raw.toLowerCase();
    if (code === 4001 || code === "ACTION_REJECTED" || /reject|denied|user denied/.test(low)) return t("rejected");
    if (/paused/.test(low)) return t("paused");
    if (/\bopen\b/.test(low)) return t("hasOpen");
    if (/\bwait\b/.test(low)) return t("waitReady");
    if (/\bpool\b|\bpaused\b/.test(low)) return t("noPool");
    if (/insufficient|transfer amount exceeds|exceeds balance/.test(low)) return t("needLim");
    if (/no_wallet|ethereum/.test(low)) return t("needWallet");
    if (/bsc|chain/.test(low) && /switch|4902/.test(low)) return t("needBsc");
    return raw.slice(0, 120);
  }
  function cfg() {
    return window.CATBOX_CHAIN || {};
  }
  function sicboCfg() {
    return window.CATBOX_SICBO || {};
  }
  function eth() {
    if (!window.ethereum) throw new Error("NO_WALLET");
    return window.ethereum;
  }
  async function readProvider() {
    return new ethers.JsonRpcProvider(cfg().rpc || "https://bsc-dataseed.binance.org", 56, {
      staticNetwork: true,
      batchMaxCount: 1,
    });
  }
  async function signer() {
    return (await new ethers.BrowserProvider(eth(), "any")).getSigner();
  }
  function limContract(s) {
    return new ethers.Contract(
      cfg().lim || LIM_ADDR,
      [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
      ],
      s,
    );
  }
  function gameContract(s) {
    const c = sicboCfg();
    if (!c.address || !c.abi) throw new Error("NO_SICBO");
    return new ethers.Contract(c.address, c.abi, s);
  }
  function parseBet(b) {
    return {
      side: Number(b.side ?? b[0] ?? 0),
      lockBlock: Number(b.lockBlock ?? b[1] ?? 0),
      open: Boolean(b.open ?? b[2]),
      amount: b.amount ?? b[3] ?? 0n,
    };
  }
  function fmtLim(v) {
    const n = Number(ethers.formatEther(v || 0n));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function won(side, d1, d2, d3) {
    if (d1 === d2 && d2 === d3) return { ok: false, why: "triple" };
    const sum = d1 + d2 + d3;
    if (sum >= 9 && sum <= 12) return { ok: false, why: "mid" };
    if (side === 0) return { ok: sum >= 4 && sum <= 8, why: "miss" };
    return { ok: sum >= 13 && sum <= 17, why: "miss" };
  }
  const FACE_PIPS = {
    1: ["c"],
    2: ["tl", "br"],
    3: ["tl", "c", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "c", "bl", "br"],
    6: ["tl", "ml", "bl", "tr", "mr", "br"],
  };
  function paintDie(die, n) {
    const v = Math.max(1, Math.min(6, Number(n) || 1));
    die.dataset.face = String(v);
    const face = die.querySelector(".die-face");
    if (!face) return;
    face.replaceChildren();
    FACE_PIPS[v].forEach((pos) => {
      const pip = document.createElement("span");
      pip.className = `pip ${pos}`;
      face.appendChild(pip);
    });
  }
  function setFaces(a, b, c) {
    const dice = diceEls();
    [a, b, c].forEach((n, i) => {
      if (dice[i]) paintDie(dice[i], n);
    });
  }
  function paintChips() {
    root()?.querySelectorAll(".sicbo-chip").forEach((el) => {
      el.classList.toggle("on", Number(el.dataset.lim) === stakeLim);
    });
  }
  function buildChips() {
    const row = $("sbChips");
    if (!row || row.children.length) return;
    for (let n = MIN_STAKE; n <= MAX_STAKE; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sicbo-chip" + (n === stakeLim ? " on" : "");
      btn.dataset.lim = String(n);
      btn.textContent = String(n);
      btn.onclick = () => {
        if (busy || pendingLock || phase !== "edit") return;
        stakeLim = n;
        paintChips();
      };
      row.appendChild(btn);
    }
  }
  function buildDice() {
    const row = $("sbDice");
    if (!row || row.children.length) return;
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement("div");
      slot.className = "die-slot";
      const die = document.createElement("div");
      die.className = "die";
      const face = document.createElement("div");
      face.className = "die-face";
      die.appendChild(face);
      slot.appendChild(die);
      row.appendChild(slot);
      paintDie(die, 5);
    }
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function coverCup(on) {
    const cup = $("sbCup");
    if (!cup) return;
    cup.className = on ? "sicbo-cup cover" : "sicbo-cup idle";
  }

  async function ensureBsc() {
    const id = await eth().request({ method: "eth_chainId" });
    if (id === "0x38") return;
    try {
      await eth().request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    } catch (e) {
      if (e?.code === 4902) {
        await eth().request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x38",
              chainName: "BNB Smart Chain",
              nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
              rpcUrls: [cfg().rpc || "https://bsc-dataseed.binance.org"],
              blockExplorerUrls: ["https://bscscan.com"],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }

  async function connect() {
    if (window.CatboxChain?.connect) {
      account = await CatboxChain.connect();
      return account;
    }
    await ensureBsc();
    const accounts = await eth().request({ method: "eth_requestAccounts" });
    account = ethers.getAddress(accounts[0]);
    return account;
  }

  function syncAccount() {
    if (window.CatboxChain?.account) account = CatboxChain.account;
  }

  async function loadOpenBet() {
    if (!account) return pendingLock ? { open: true, lockBlock: pendingLock, side: pendingSide, amount: 0n } : null;
    const g = gameContract(await readProvider());
    const b = parseBet(await g.bets(account));
    if (!b.open) {
      pendingLock = 0;
      if (phase === "wait") {
        phase = "edit";
        coverCup(false);
        $("sbSmall")?.classList.remove("picked");
        $("sbBig")?.classList.remove("picked");
      }
      return null;
    }
    pendingLock = b.lockBlock;
    pendingSide = b.side;
    pendingStake = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Number(ethers.formatEther(b.amount || 0n))));
    stakeLim = pendingStake || stakeLim;
    if (phase === "edit") phase = "wait";
    $("sbSmall")?.classList.toggle("picked", pendingSide === 0);
    $("sbBig")?.classList.toggle("picked", pendingSide === 1);
    coverCup(true);
    return b;
  }

  async function refreshStats() {
    if (spinning) return;
    syncAccount();
    let pool = 0n;
    let lim = 0n;
    try {
      const p = await readProvider();
      const g = gameContract(p);
      pool = await g.freePool();
      if (account) lim = await limContract(p).balanceOf(account);
      if (!busy && phase !== "result") await loadOpenBet();
      if (pendingLock && phase !== "result") {
        const n = Number(await p.getBlockNumber());
        const left = Math.max(0, pendingLock + 1 - n);
        setStatus(left ? t("wait", { n: left }) : t("waitReady"));
      }
    } catch (_) {}
    setTxt("sbWallet", t("bal", { lim: account ? fmtLim(lim) : "—", pool: fmtLim(pool) }));
    paintChips();
    paintPhase();
  }

  function hidePop() {
    $("sbPop")?.classList.add("hidden");
  }
  function resetRound() {
    phase = "edit";
    pendingLock = 0;
    lastOutcome = null;
    hidePop();
    coverCup(false);
    setTxt("sbResult", "");
    $("sbResult")?.removeAttribute("data-hit");
    setTxt("sbTotal", "—");
    setStatus("");
    $("sbSmall")?.classList.remove("picked");
    $("sbBig")?.classList.remove("picked");
    paintPhase();
  }

  function paintOutcome() {
    if (!lastOutcome) return;
    if (lastOutcome.kind === "refund") {
      setTxt("sbTotal", "—");
      setTxt("sbResult", t("refund"));
      $("sbResult")?.setAttribute("data-hit", "0");
      return;
    }
    const { side, d1, d2, d3, stake } = lastOutcome;
    const sum = d1 + d2 + d3;
    setTxt("sbTotal", t("total", { n: sum }));
    const w = won(side, d1, d2, d3);
    const doubled = String(stake * 2);
    let line = t("lose");
    if (w.ok) line = t("win", { n: doubled });
    else if (w.why === "triple") line = t("loseTriple");
    else if (w.why === "mid") line = t("loseMid");
    setTxt("sbResult", line);
    $("sbResult")?.setAttribute("data-hit", w.ok ? "1" : "0");
  }

  function showOutcome(side, d1, d2, d3, stake) {
    lastOutcome = { kind: "settled", side, d1, d2, d3, stake };
    setFaces(d1, d2, d3);
    paintOutcome();
    setStatus("");
    hidePop();
    phase = "result";
    pendingLock = 0;
    $("sbSmall")?.classList.toggle("picked", side === 0);
    $("sbBig")?.classList.toggle("picked", side === 1);
    paintPhase();
  }

  async function spinTo(d1, d2, d3) {
    const stage = $("sbStage");
    const cup = $("sbCup");
    const felt = $("sbFelt");
    spinning = true;
    hidePop();
    setTxt("sbTotal", "…");
    setTxt("sbResult", "");
    $("sbResult")?.removeAttribute("data-hit");
    setStatus(t("shaking"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFaces(d1, d2, d3);
      if (cup) cup.className = "sicbo-cup idle";
      spinning = false;
      return;
    }
    if (cup) cup.className = "sicbo-cup cover";
    await sleep(220);
    stage?.classList.add("shaking");
    felt?.classList.add("shaking");
    await sleep(900);
    stage?.classList.remove("shaking");
    felt?.classList.remove("shaking");
    setFaces(d1, d2, d3);
    diceEls().forEach((el) => {
      el.classList.remove("land");
      void el.offsetWidth;
      el.classList.add("land");
    });
    if (cup) cup.className = "sicbo-cup lift";
    await sleep(500);
    if (cup) cup.className = "sicbo-cup idle";
    diceEls().forEach((el) => el.classList.remove("land"));
    spinning = false;
  }

  function parseSettled(g, rec) {
    const logs = rec?.logs || [];
    for (const l of logs) {
      try {
        const ev = g.interface.parseLog(l);
        if (ev && (ev.name === "Settled" || ev.name === "Refunded")) return ev;
      } catch (_) {}
    }
    return null;
  }

  async function waitForLock(lockBlock) {
    coverCup(true);
    const p = await readProvider();
    for (let i = 0; i < 48; i++) {
      const n = Number(await p.getBlockNumber());
      const left = Math.max(0, lockBlock + 1 - n);
      if (n > lockBlock) {
        setStatus(t("waitReady"));
        return true;
      }
      setStatus(t("wait", { n: left }));
      paintPhase();
      await sleep(1500);
    }
    setStatus(t("waitReady"));
    return false;
  }

  async function openCup() {
    if (!pendingLock) {
      await loadOpenBet();
      if (!pendingLock) return;
    }
    if (!account) await connect();
    await ensureBsc();
    await waitForLock(pendingLock);
    setStatus(t("opening"));
    paintPhase();
    await sleep(350);
    const g = gameContract(await signer());
    const tx = await g.settle();
    const rec = await tx.wait();
    const ev = parseSettled(g, rec);
    if (ev?.name === "Refunded") {
      lastOutcome = { kind: "refund" };
      coverCup(false);
      phase = "result";
      pendingLock = 0;
      paintOutcome();
      setStatus("");
      hidePop();
      paintPhase();
    } else if (ev?.name === "Settled") {
      const d1 = Number(ev.args.d1);
      const d2 = Number(ev.args.d2);
      const d3 = Number(ev.args.d3);
      await spinTo(d1, d2, d3);
      showOutcome(Number(ev.args.side), d1, d2, d3, pendingStake || stakeLim);
    } else {
      setStatus(t("refund"));
      phase = "edit";
      pendingLock = 0;
      paintPhase();
    }
    await refreshStats();
  }

  async function liveBet(side) {
    syncAccount();
    if (!account) account = await connect();
    if (!account) throw new Error("NO_WALLET");
    await ensureBsc();
    const open = await loadOpenBet();
    if (open) {
      phase = "wait";
      coverCup(true);
      paintPhase();
      setStatus(t("resume"));
      toast(t("hasOpen"));
      return;
    }
    const s = await signer();
    const g = gameContract(s);
    const lim = limContract(s);
    const amount = UNIT * BigInt(stakeLim);
    const [free, bal] = await Promise.all([g.freePool(), lim.balanceOf(account)]);
    if (free < amount) {
      toast(t("noPool"));
      setStatus(t("noPool"));
      return;
    }
    if (bal < amount) {
      toast(t("needLim"));
      setStatus(t("needLim"));
      return;
    }
    const allow = await lim.allowance(account, sicboCfg().address);
    if (allow < amount) {
      setStatus(t("approve"));
      toast(t("approve"));
      const txA = await lim.approve(sicboCfg().address, ethers.MaxUint256);
      await txA.wait();
    }
    setStatus(t("paying", { n: stakeLim }));
    $("sbSmall")?.classList.toggle("picked", side === 0);
    $("sbBig")?.classList.toggle("picked", side === 1);
    coverCup(true);
    const tx = await g.placeBet(side, amount);
    await tx.wait();
    const b = parseBet(await g.bets(account));
    pendingLock = b.lockBlock;
    pendingSide = b.side;
    pendingStake = stakeLim;
    phase = "wait";
    paintPhase();
    setStatus(t("wait", { n: 2 }));
  }

  async function onSide(side) {
    if (busy || spinning) return;
    if (phase === "result") return;
    if (phase === "wait" || pendingLock) {
      toast(t("hasOpen"));
      setStatus(t("resume"));
      return;
    }
    hidePop();
    busy = true;
    paintPhase();
    try {
      await liveBet(side);
    } catch (e) {
      const msg = friendly(e);
      setStatus(msg);
      toast(msg);
      if (pendingLock) coverCup(true);
    } finally {
      busy = false;
      paintPhase();
      refreshStats().catch(() => {});
    }
  }

  async function onOpen() {
    if (busy || spinning) return;
    if (phase === "result") {
      resetRound();
      return;
    }
    busy = true;
    paintPhase();
    try {
      await openCup();
    } catch (e) {
      const msg = friendly(e);
      setStatus(msg);
      toast(msg);
    } finally {
      busy = false;
      paintPhase();
      refreshStats().catch(() => {});
    }
  }

  async function resumeIfOpen() {
    if (busy || spinning || phase === "result") return;
    syncAccount();
    if (!account) return;
    const b = await loadOpenBet();
    if (b) setStatus(t("resume"));
  }

  function bindUi() {
    $("sbSmall")?.addEventListener("click", () => onSide(0));
    $("sbBig")?.addEventListener("click", () => onSide(1));
    $("sbOpen")?.addEventListener("click", () => onOpen());
    $("sbPopOk")?.addEventListener("click", (e) => {
      e.stopPropagation();
      hidePop();
    });
    $("sbPop")?.addEventListener("click", (e) => {
      if (e.target === $("sbPop")) hidePop();
    });
    if (!dashMode() && $("walletBtn")) {
      $("walletBtn").onclick = async () => {
        try {
          $("walletBtn").textContent = lang === "zh" ? "连接中…" : "CONNECTING…";
          await connect();
          $("walletBtn").textContent = account ? account.slice(0, 6) + "…" + account.slice(-4) : t("needWallet");
          await refreshStats();
          resumeIfOpen().catch(() => {});
        } catch (e) {
          toast(friendly(e));
          $("walletBtn").textContent = lang === "zh" ? "连接钱包" : "CONNECT";
        }
      };
    }
  }

  function bootSicBo() {
    if (!$("sbFelt") || bootSicBo._on) return;
    bootSicBo._on = true;
    syncAccount();
    bindUi();
    buildChips();
    buildDice();
    setFaces(4, 5, 6);
    applyCopy();
    refreshStats().catch(() => {});
    window.addEventListener("catbox-wallet", () => {
      syncAccount();
      refreshStats().catch(() => {});
      resumeIfOpen().catch(() => {});
    });
    setInterval(() => {
      if (spinning || busy) return;
      refreshStats().catch(() => {});
    }, 2000);
  }

  window.bootSicBo = bootSicBo;
  window.refreshSicbo = () => {
    applyCopy();
    return refreshStats();
  };
  window.refreshSicboCopy = applyCopy;
  window.resumeSicbo = resumeIfOpen;
  bootSicBo();
})();
