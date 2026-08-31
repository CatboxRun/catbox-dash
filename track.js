/* global ethers, CATBOX_CHAIN, CATBOX_TRACK, CatboxChain */
(function () {
  const LIM_ADDR = "0x1D6430FDFC63ea481fE157017B47530663C96001";
  const UNIT = 10n ** 18n;
  const MIN_STAKE = 1;
  const MAX_STAKE = 5;
  const COLS = 5;
  const KIND = ["coin", "gap", "light", "pipe", "box"];
  const KIND_KEY = ["dailyCoin", "dailyGap", "dailyLight", "dailyPipe", "dailyBox"];
  const PIECE_SRC = [
    "./assets/coin.png?v=4",
    "./assets/piece-gap.png?v=1",
    "./assets/piece-light.png?v=1",
    "./assets/piece-pipe.png?v=1",
    "./assets/catbox.png?v=3",
  ];
  const LOCK_SRC = "./assets/lock-seal.png?v=1";
  const HIST = "catbox-track-hist-v1";
  const COPY = {
    zh: {
      kicker: "赛道揭图",
      lead: "摆好五格，点锁图。练手马上揭。带 LIM 等两个块，再点揭图。只计对位，上一局不带提示。",
      stake: "本局额度",
      practice: "练手",
      lock: "锁图",
      open: "揭图",
      next: "再来一局",
      opening: "揭图中，请在钱包确认…",
      flipping: "揭开…",
      wait: "已锁。再等 {n} 个块，再点揭图。",
      waitReady: "可以揭图了。点揭图，在钱包确认。",
      hist: "近局 · 不带进下一局",
      r1: "1–5 LIM 开一局。零注练手：不进池、不派奖。",
      r2: "对位 2 格一半，3 格 8 倍，4 格 40 倍，5 格 200 倍（不超过桌池一半）。0–1 格不派。",
      r3: "只认位置全对。块对位错，不派。",
      r4: "独立桌池。带 LIM 锁图后等两个块，再点揭图。未揭的注，回来还能继续。",
      r5: "揭图由合约自动执行，不人为改图。不进日榜、邀请榜、底池。不是门票。",
      r6: "桌池每周按比例销毁。未揭的注不烧。",
      win: "对位 {h} 格。{n} LIM 已到钱包。",
      lose: "未到派奖线。本金留在桌池。",
      practiceWin: "练手对位 {h} 格。不派 LIM。",
      practiceLose: "练手未到派奖线。不进池。",
      needWallet: "请先连接钱包。",
      needBsc: "请切换到 BSC。",
      noPool: "桌池不够覆盖这一局，稍后再开。",
      noTable: "真图桌还没上线。现在只开放练手，不进池。",
      needLim: "钱包 LIM 不够这一局。",
      paying: "锁图 {n} LIM，请在钱包确认…",
      approve: "请先授权 LIM。",
      refund: "超时，本金已退回。",
      bal: "LIM {lim} · 桌池 {pool}",
      filling: "请摆满五格再锁。",
      locked: "已锁。等待揭图。",
      rejected: "已取消。未揭的注点「揭图」继续。",
      hasOpen: "这一局还没揭。请点揭图。",
      paused: "桌子暂停中。",
      resume: "你有一局尚未揭图。",
      guess: "你的五格",
      truth: "真图",
      pay2: "对位 2",
      pay3: "对位 3",
      pay4: "对位 4",
      pay5: "对位 5",
      ok: "好",
    },
    en: {
      kicker: "REVEAL",
      lead: "Set five, then lock. Practice opens at once. With LIM, wait two blocks and tap REVEAL. Exact place only — no carry-over hints.",
      stake: "STAKE",
      practice: "PRACTICE",
      lock: "LOCK",
      open: "REVEAL",
      next: "NEXT",
      opening: "Revealing — confirm in wallet…",
      flipping: "Opening…",
      wait: "Locked. {n} blocks, then tap REVEAL.",
      waitReady: "Ready. Tap REVEAL and confirm in the wallet.",
      hist: "Recent · not used next round",
      r1: "1–5 LIM per round. Zero is practice — no pool, no payout.",
      r2: "2 exact 0.5× · 3 exact 8× · 4 exact 40× · 5 exact 200× (capped at half the table). 0–1 pay nothing.",
      r3: "Exact place only. Right piece, wrong place does not pay.",
      r4: "Own table pool. With LIM, wait two blocks, then tap REVEAL. An open round can be finished later.",
      r5: "The contract reveals the map. Nobody sets the tiles. Not the daily board, invite board, or floor. Not a ticket.",
      r6: "The table pool is burned in proportion each week. Open rounds are not burned.",
      win: "{h} exact. {n} LIM is in the wallet.",
      lose: "Below the pay line. Stake stays in the table.",
      practiceWin: "Practice: {h} exact. No LIM.",
      practiceLose: "Practice: below the pay line. No pool.",
      needWallet: "Connect wallet first.",
      needBsc: "Switch to BSC.",
      noPool: "The table cannot cover this round. Try later.",
      noTable: "The reveal table is not live. Practice only — no pool.",
      needLim: "Not enough LIM for this round.",
      paying: "Locking {n} LIM — confirm in wallet…",
      approve: "Approve LIM in wallet…",
      refund: "Timed out. Stake returned.",
      bal: "LIM {lim} · TABLE {pool}",
      filling: "Fill five cells first.",
      locked: "Locked. Wait to reveal.",
      rejected: "Cancelled. Tap REVEAL if a round is still waiting.",
      hasOpen: "This round is still open. Reveal it.",
      paused: "Table is paused.",
      resume: "You have an open round.",
      guess: "YOUR FIVE",
      truth: "THE TRACK",
      pay2: "2 EXACT",
      pay3: "3 EXACT",
      pay4: "4 EXACT",
      pay5: "5 EXACT",
      ok: "OK",
    },
    ja: {
      kicker: "コース開封",
      lead: "5マスを並べてロック。練習はすぐ開く。LIM ありは2ブロック待って開封。位置のみ。前の回のヒントは持たない。",
      stake: "この回の額",
      practice: "練習",
      lock: "ロック",
      open: "開封",
      next: "もう一局",
      opening: "開封中。ウォレットで確認…",
      flipping: "開いている…",
      wait: "ロック済み。あと {n} ブロック、それから開封。",
      waitReady: "開封できる。開封を押してウォレットで確認。",
      hist: "直近 · 次局には持ち込まない",
      r1: "1–5 LIM で一局。0 は練習：プールなし、配当なし。",
      r2: "位置一致 2 で半分、3 で 8倍、4 で 40倍、5 で 200倍（卓プールの半分まで）。0–1 は配当なし。",
      r3: "位置が完全一致のみ。ピース合って位置違いでは払わない。",
      r4: "独立卓プール。LIM でロック後 2 ブロック待って開封。未開封は後から続けられる。",
      r5: "公開はコントラクトが自動実行。人が図を決めない。日次・招待・フロアプールには入らない。チケットではない。",
      r6: "卓プールは毎週、割合に応じてバーン。未開封の賭けは焼かない。",
      win: "位置 {h}。{n} LIM がウォレットへ。",
      lose: "配当ライン未満。元本は卓プールへ。",
      practiceWin: "練習：位置 {h}。LIM なし。",
      practiceLose: "練習：配当ライン未満。プールなし。",
      needWallet: "先にウォレット接続。",
      needBsc: "BSC に切り替えて。",
      noPool: "卓プールがこの回を賄えない。少し待って。",
      noTable: "本卓はまだ未公開。今は練習のみ、プールなし。",
      needLim: "この回の LIM が足りない。",
      paying: "{n} LIM をロック。ウォレットで確認…",
      approve: "先に LIM を承認。",
      refund: "時間切れ。元本は戻った。",
      bal: "LIM {lim} · 卓 {pool}",
      filling: "5マス埋めてからロック。",
      locked: "ロック済み。開封待ち。",
      rejected: "キャンセル。未開封なら「開封」で続ける。",
      hasOpen: "まだ開封していない。開封して。",
      paused: "卓は一時停止中。",
      resume: "未開封の局がある。",
      guess: "あなたの5マス",
      truth: "本物",
      pay2: "一致 2",
      pay3: "一致 3",
      pay4: "一致 4",
      pay5: "一致 5",
      ok: "OK",
    },
    ko: {
      kicker: "트랙 공개",
      lead: "다섯 칸을 놓고 잠근다. 연습은 바로 연다. LIM이 있으면 두 블록 기다렸다가 공개. 자리만 센다. 이전 판 힌트는 안 가져간다.",
      stake: "이번 판 금액",
      practice: "연습",
      lock: "잠금",
      open: "공개",
      next: "한 판 더",
      opening: "공개 중. 지갑에서 확인…",
      flipping: "여는 중…",
      wait: "잠김. {n}블록 뒤 공개하세요.",
      waitReady: "공개 가능. 공개를 누르고 지갑에서 확인.",
      hist: "최근 · 다음 판에 안 가져감",
      r1: "1–5 LIM 한 판. 0은 연습: 풀 없음, 배당 없음.",
      r2: "자리 2이면 절반, 3이면 8배, 4는 40배, 5는 200배(테이블 풀 절반 한도). 0–1는 없음.",
      r3: "자리 완전 일치만. 조각은 맞고 자리가 다르면 안 줌.",
      r4: "독립 테이블 풀. LIM으로 잠근 뒤 두 블록 기다렸다가 공개. 안 연 판은 나중에 이어서.",
      r5: "공개는 컨트랙트가 자동 실행. 사람이 그림을 바꾸지 않음. 일간·초대·베이스 풀에 안 들어감. 티켓 아님.",
      r6: "테이블 풀은 매주 비율대로 소각. 안 연 판은 태우지 않음.",
      win: "자리 {h}. {n} LIM이 지갑으로.",
      lose: "배당선 미만. 원금은 테이블 풀에 남음.",
      practiceWin: "연습: 자리 {h}. LIM 없음.",
      practiceLose: "연습: 배당선 미만. 풀 없음.",
      needWallet: "먼저 지갑을 연결하세요.",
      needBsc: "BSC로 전환하세요.",
      noPool: "테이블이 이번 판을 감당하지 못합니다. 잠시 후.",
      noTable: "공개 테이블이 아직 없습니다. 연습만, 풀 없음.",
      needLim: "이번 판 LIM이 부족합니다.",
      paying: "{n} LIM 잠금. 지갑에서 확인…",
      approve: "먼저 LIM을 승인하세요.",
      refund: "시간 초과. 원금이 돌아왔습니다.",
      bal: "LIM {lim} · 테이블 {pool}",
      filling: "다섯 칸을 채운 뒤 잠그세요.",
      locked: "잠김. 공개 대기.",
      rejected: "취소됨. 안 연 판은 공개로 이어가세요.",
      hasOpen: "아직 안 열었습니다. 공개하세요.",
      paused: "테이블이 일시정지되었습니다.",
      resume: "아직 안 연 판이 있습니다.",
      guess: "당신의 다섯",
      truth: "진트랙",
      pay2: "일치 2",
      pay3: "일치 3",
      pay4: "일치 4",
      pay5: "일치 5",
      ok: "확인",
    },
    vi: {
      kicker: "LẬT ĐƯỜNG",
      lead: "Xếp năm ô, rồi khóa. Tập mở ngay. Có LIM thì đợi hai khối rồi lật. Chỉ tính đúng chỗ. Ván trước không mang gợi ý.",
      stake: "MỨC VÁN NÀY",
      practice: "TẬP",
      lock: "KHÓA",
      open: "LẬT",
      next: "VÁN NỮA",
      opening: "Đang lật — xác nhận trong ví…",
      flipping: "Đang mở…",
      wait: "Đã khóa. Còn {n} khối, rồi lật.",
      waitReady: "Lật được rồi. Bấm LẬT và xác nhận trong ví.",
      hist: "Ván gần · không mang sang ván sau",
      r1: "1–5 LIM mỗi ván. 0 là tập: không vào quỹ, không trả thưởng.",
      r2: "Đúng chỗ 2 thì nửa, 3 thì 8×, 4 thì 40×, 5 thì 200× (không quá nửa quỹ bàn). 0–1 không trả.",
      r3: "Chỉ tính đúng chỗ. Đúng mảnh sai chỗ không trả.",
      r4: "Quỹ bàn riêng. Có LIM khóa xong đợi hai khối rồi lật. Ván chưa lật, quay lại vẫn làm tiếp.",
      r5: "Hợp đồng tự lật hình, không ai sửa ô. Không vào bảng ngày, mời, hay quỹ nền. Không phải vé.",
      r6: "Quỹ bàn được đốt theo tỷ lệ mỗi tuần. Ván chưa lật không đốt.",
      win: "Đúng {h} chỗ. {n} LIM đã vào ví.",
      lose: "Chưa tới vạch trả. Gốc ở lại quỹ bàn.",
      practiceWin: "Tập: đúng {h} chỗ. Không LIM.",
      practiceLose: "Tập: chưa tới vạch. Không vào quỹ.",
      needWallet: "Hãy kết nối ví trước.",
      needBsc: "Chuyển sang BSC.",
      noPool: "Quỹ bàn không đủ cho ván này. Thử lại sau.",
      noTable: "Bàn lật chưa mở. Chỉ tập, không vào quỹ.",
      needLim: "Không đủ LIM cho ván này.",
      paying: "Khóa {n} LIM — xác nhận trong ví…",
      approve: "Phê duyệt LIM trong ví…",
      refund: "Hết giờ. Gốc đã hoàn.",
      bal: "LIM {lim} · BÀN {pool}",
      filling: "Xếp đủ năm ô rồi khóa.",
      locked: "Đã khóa. Đợi lật.",
      rejected: "Đã hủy. Ván chưa lật thì bấm LẬT.",
      hasOpen: "Ván này chưa lật. Hãy lật.",
      paused: "Bàn đang tạm dừng.",
      resume: "Bạn còn một ván chưa lật.",
      guess: "NĂM Ô CỦA BẠN",
      truth: "ĐƯỜNG THẬT",
      pay2: "ĐÚNG 2",
      pay3: "ĐÚNG 3",
      pay4: "ĐÚNG 4",
      pay5: "ĐÚNG 5",
      ok: "OK",
    },
    th: {
      kicker: "เปิดแทร็ก",
      lead: "วางห้าช่องแล้วล็อก ฝึกเปิดทันที มี LIM รอสองบล็อกแล้วเปิด นับเฉพาะตำแหน่งตรง ตาที่แล้วไม่พาคำใบ้มา",
      stake: "ยอดตานี้",
      practice: "ฝึก",
      lock: "ล็อก",
      open: "เปิด",
      next: "ตาใหม่",
      opening: "กำลังเปิด — ยืนยันในกระเป๋า…",
      flipping: "กำลังเปิด…",
      wait: "ล็อกแล้ว เหลือ {n} บล็อก แล้วเปิด",
      waitReady: "เปิดได้แล้ว กดเปิดแล้วยืนยันในกระเป๋า",
      hist: "ตาใกล้ ๆ · ไม่พาไปตาถัดไป",
      r1: "1–5 LIM ต่อตา ศูนย์คือฝึก: ไม่เข้ากอง ไม่จ่าย",
      r2: "ตรงตำแหน่ง 2 ได้ครึ่ง 3 ได้ 8 เท่า 4 ได้ 40 เท่า 5 ได้ 200 เท่า (ไม่เกินครึ่งกองโต๊ะ) 0–1 ไม่จ่าย",
      r3: "นับเฉพาะตำแหน่งตรง ชิ้นถูกแต่ที่ผิดไม่จ่าย",
      r4: "กองโต๊ะของตัวเอง มี LIM ล็อกแล้วรอสองบล็อกแล้วเปิด ตายังไม่เปิด กลับมาเปิดต่อได้",
      r5: "สัญญาเปิดรูปเอง ไม่มีคนแก้ช่อง ไม่เข้ากระดานวัน ชวน หรือกองฐาน ไม่ใช่ตั๋ว",
      r6: "กองโต๊ะถูกเผาตามสัดส่วนทุกสัปดาห์ ตายังไม่เปิดไม่เผา",
      win: "ตรง {h} ช่อง {n} LIM เข้ากระเป๋าแล้ว",
      lose: "ยังไม่ถึงเส้นจ่าย เงินต้นอยู่ในกองโต๊ะ",
      practiceWin: "ฝึก: ตรง {h} ไม่มี LIM",
      practiceLose: "ฝึก: ยังไม่ถึงเส้น ไม่เข้ากอง",
      needWallet: "เชื่อมกระเป๋าก่อน",
      needBsc: "สลับไป BSC",
      noPool: "กองโต๊ะไม่พอสำหรับตานี้ ลองใหม่ภายหลัง",
      noTable: "โต๊ะเปิดยังไม่เปิด ฝึกได้อย่างเดียว ไม่เข้ากอง",
      needLim: "LIM ไม่พอสำหรับตานี้",
      paying: "ล็อก {n} LIM — ยืนยันในกระเป๋า…",
      approve: "อนุมัติ LIM ในกระเป๋า…",
      refund: "หมดเวลา คืนเงินต้นแล้ว",
      bal: "LIM {lim} · โต๊ะ {pool}",
      filling: "เติมห้าช่องก่อนล็อก",
      locked: "ล็อกแล้ว รอเปิด",
      rejected: "ยกเลิกแล้ว ถ้าตายังไม่เปิด กดเปิด",
      hasOpen: "ตานี้ยังไม่เปิด เปิดเลย",
      paused: "โต๊ะหยุดชั่วคราว",
      resume: "คุณมีตาที่ยังไม่เปิด",
      guess: "ห้าช่องของคุณ",
      truth: "แทร็กจริง",
      pay2: "ตรง 2",
      pay3: "ตรง 3",
      pay4: "ตรง 4",
      pay5: "ตรง 5",
      ok: "ตกลง",
    },
    ru: {
      kicker: "ОТКРЫТЬ",
      lead: "Расставьте пять и заблокируйте. Практика открывается сразу. С LIM — два блока, затем ОТКРЫТЬ. Только точное место. Подсказки прошлой игры не переносятся.",
      stake: "СТАВКА",
      practice: "ПРАКТИКА",
      lock: "БЛОК",
      open: "ОТКРЫТЬ",
      next: "ЕЩЁ РАЗ",
      opening: "Открытие — подтвердите в кошельке…",
      flipping: "Открываем…",
      wait: "Закрыто. Ещё {n} блоков, затем ОТКРЫТЬ.",
      waitReady: "Можно открыть. Нажмите ОТКРЫТЬ и подтвердите в кошельке.",
      hist: "Недавние · в следующую игру не идут",
      r1: "1–5 LIM за раунд. Ноль — практика: без пула и выплат.",
      r2: "2 точных 0.5× · 3 — 8× · 4 — 40× · 5 — 200× (не больше половины пула стола). 0–1 не платят.",
      r3: "Только точное место. Фигура верна, место нет — не платит.",
      r4: "Свой пул стола. С LIM после блокировки два блока, затем откройте. Неоткрытый раунд можно доиграть позже.",
      r5: "Контракт открывает карту сам. Клетки не задаёт человек. Не дневной, инвайт и не базовый пул. Не билет.",
      r6: "Пул стола еженедельно сжигается пропорционально. Неоткрытые раунды не сжигаются.",
      win: "{h} точных. {n} LIM на кошельке.",
      lose: "Ниже линии выплаты. Ставка остаётся в пуле стола.",
      practiceWin: "Практика: {h} точных. Без LIM.",
      practiceLose: "Практика: ниже линии. Без пула.",
      needWallet: "Сначала подключите кошелёк.",
      needBsc: "Переключитесь на BSC.",
      noPool: "Стол не покрывает этот раунд. Позже.",
      noTable: "Стол открытия ещё не живой. Только практика — без пула.",
      needLim: "Не хватает LIM на этот раунд.",
      paying: "Блокировка {n} LIM — подтвердите в кошельке…",
      approve: "Разрешите LIM в кошельке…",
      refund: "Время вышло. Ставка возвращена.",
      bal: "LIM {lim} · СТОЛ {pool}",
      filling: "Сначала заполните пять клеток.",
      locked: "Закрыто. Ждите открытия.",
      rejected: "Отменено. Если раунд ждёт — нажмите ОТКРЫТЬ.",
      hasOpen: "Этот раунд ещё не открыт. Откройте.",
      paused: "Стол на паузе.",
      resume: "У вас есть неоткрытый раунд.",
      guess: "ВАШИ ПЯТЬ",
      truth: "ТРАССА",
      pay2: "2 ТОЧНЫХ",
      pay3: "3 ТОЧНЫХ",
      pay4: "4 ТОЧНЫХ",
      pay5: "5 ТОЧНЫХ",
      ok: "ОК",
    },
    id: {
      kicker: "BUKA TREK",
      lead: "Susun lima, lalu kunci. Latihan langsung buka. Pakai LIM, tunggu dua blok lalu buka. Hanya posisi pas. Petunjuk ronde lalu tidak dibawa.",
      stake: "TARUHAN RONDE INI",
      practice: "LATIHAN",
      lock: "KUNCI",
      open: "BUKA",
      next: "RONDE LAGI",
      opening: "Membuka — konfirmasi di dompet…",
      flipping: "Membuka…",
      wait: "Terkunci. {n} blok lagi, lalu BUKA.",
      waitReady: "Siap. Ketuk BUKA dan konfirmasi di dompet.",
      hist: "Baru-baru · tidak dibawa ke ronde berikutnya",
      r1: "1–5 LIM per ronde. Nol adalah latihan: tanpa pool, tanpa bayaran.",
      r2: "2 pas 0.5× · 3 pas 8× · 4 — 40× · 5 — 200× (maksimal setengah pool meja). 0–1 tidak bayar.",
      r3: "Hanya posisi pas. Keping benar, posisi salah, tidak dibayar.",
      r4: "Pool meja sendiri. Dengan LIM, setelah kunci tunggu dua blok lalu buka. Ronde belum dibuka bisa dilanjut nanti.",
      r5: "Kontrak membuka peta sendiri. Tidak ada yang mengatur kotak. Bukan papan harian, undangan, atau pool dasar. Bukan tiket.",
      r6: "Pool meja dibakar proporsional tiap minggu. Ronde belum dibuka tidak dibakar.",
      win: "{h} pas. {n} LIM sudah di dompet.",
      lose: "Di bawah garis bayar. Pokok tetap di pool meja.",
      practiceWin: "Latihan: {h} pas. Tanpa LIM.",
      practiceLose: "Latihan: di bawah garis. Tanpa pool.",
      needWallet: "Hubungkan dompet dulu.",
      needBsc: "Pindah ke BSC.",
      noPool: "Meja tidak cukup untuk ronde ini. Coba nanti.",
      noTable: "Meja buka belum live. Latihan saja — tanpa pool.",
      needLim: "LIM tidak cukup untuk ronde ini.",
      paying: "Mengunci {n} LIM — konfirmasi di dompet…",
      approve: "Setujui LIM di dompet…",
      refund: "Waktu habis. Pokok dikembalikan.",
      bal: "LIM {lim} · MEJA {pool}",
      filling: "Isi lima kotak dulu.",
      locked: "Terkunci. Tunggu buka.",
      rejected: "Dibatalkan. Jika ronde masih menunggu, ketuk BUKA.",
      hasOpen: "Ronde ini belum dibuka. Buka.",
      paused: "Meja sedang jeda.",
      resume: "Anda punya ronde yang belum dibuka.",
      guess: "LIMA ANDA",
      truth: "TREK ASLI",
      pay2: "2 PAS",
      pay3: "3 PAS",
      pay4: "4 PAS",
      pay5: "5 PAS",
      ok: "OK",
    },
    fil: {
      kicker: "BUNYAG",
      lead: "Ilagay ang lima, tapos i-lock. Practice, agad bubukas. May LIM, maghintay ng dalawang block tapos BUNYAG. Exact place lang. Walang dalang hint mula sa nakaraang ronda.",
      stake: "TAYA NG RONDANG ITO",
      practice: "PRACTICE",
      lock: "LOCK",
      open: "BUNYAG",
      next: "ULIT",
      opening: "Binubuksan — kumpirmahin sa wallet…",
      flipping: "Binubuksan…",
      wait: "Naka-lock. {n} block, tapos BUNYAG.",
      waitReady: "Pwede na. Pindutin ang BUNYAG at kumpirmahin sa wallet.",
      hist: "Kamakailan · hindi dadalhin sa susunod",
      r1: "1–5 LIM bawat ronda. Zero ay practice: walang pool, walang bayad.",
      r2: "2 exact 0.5× · 3 exact 8× · 4 — 40× · 5 — 200× (hanggang kalahati ng pool ng mesa). 0–1 walang bayad.",
      r3: "Exact place lang. Tama ang piraso, mali ang lugar, hindi nagbabayad.",
      r4: "Sariling pool ng mesa. May LIM, maghintay ng dalawang block pagkatapos mag-lock, tapos bunyagin. Ang hindi pa nabubuksang ronda, puwedeng tapusin mamaya.",
      r5: "Kontrata ang nagbubukas ng mapa. Walang tao na nagtatakda ng tile. Hindi daily board, invite, o floor. Hindi ticket.",
      r6: "Ang pool ng mesa ay sinusunog nang proporsyonal tuwing linggo. Hindi sinusunog ang hindi pa nabubuksang ronda.",
      win: "{h} exact. {n} LIM nasa wallet na.",
      lose: "Hindi umabot sa pay line. Taya ay nasa pool ng mesa.",
      practiceWin: "Practice: {h} exact. Walang LIM.",
      practiceLose: "Practice: hindi umabot. Walang pool.",
      needWallet: "Ikonekta muna ang wallet.",
      needBsc: "Lumipat sa BSC.",
      noPool: "Hindi kayang i-cover ng mesa ang rondang ito. Subukan mamaya.",
      noTable: "Hindi pa live ang mesa ng bunyag. Practice lang — walang pool.",
      needLim: "Kulang ang LIM para sa rondang ito.",
      paying: "Nagla-lock ng {n} LIM — kumpirmahin sa wallet…",
      approve: "I-approve ang LIM sa wallet…",
      refund: "Timeout. Naibalik ang taya.",
      bal: "LIM {lim} · MESA {pool}",
      filling: "Punuin muna ang limang cell.",
      locked: "Naka-lock. Maghintay magbunyag.",
      rejected: "Kinansela. Kung may hinihintay pang ronda, pindutin ang BUNYAG.",
      hasOpen: "Hindi pa nabubuksan ang rondang ito. Bunyagin.",
      paused: "Naka-pause ang mesa.",
      resume: "May rondang hindi pa nabubuksan.",
      guess: "LIMANG IYO",
      truth: "ANG TRACK",
      pay2: "2 EXACT",
      pay3: "3 EXACT",
      pay4: "4 EXACT",
      pay5: "5 EXACT",
      ok: "OK",
    },
  };

  const root = () => document.getElementById("trRoot");
  const $ = (id) => document.getElementById(id);

  let lang = "zh";
  let account = null;
  let busy = false;
  let stakeLim = 0;
  let draft = [];
  let pendingLock = 0;
  let pendingGuess = 0;
  let pendingStake = 0;
  let liveOk = false;
  let phase = "edit";
  let shownTrack = null;

  function dashMode() {
    return Boolean(window.CatboxChain && $("lobby") && $("trRoot"));
  }
  function syncLang() {
    lang = COPY[document.body.dataset.lang] ? document.body.dataset.lang : "en";
  }
  const tt = (k, vars = {}) => {
    if (typeof t === "function" && (k.startsWith("daily") || k === "playTag")) return t(k, vars);
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
    setTxt("trStatus", msg || "");
  }
  function toast(msg) {
    if (typeof showToast === "function") showToast(msg);
    else {
      const el = $("toast");
      if (!el || !msg) return;
      el.textContent = msg;
      el.classList.remove("hidden");
      clearTimeout(toast._t);
      toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
    }
  }
  function cfg() {
    return window.CATBOX_CHAIN || {};
  }
  function trackCfg() {
    return window.CATBOX_TRACK || {};
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
    const c = trackCfg();
    if (!c.address || !c.abi) throw new Error("NO_TRACK");
    return new ethers.Contract(c.address, c.abi, s);
  }
  function pack(cells) {
    return cells[0] + 5 * cells[1] + 25 * cells[2] + 125 * cells[3] + 625 * cells[4];
  }
  function unpack(n) {
    const c = [];
    let x = Number(n) || 0;
    for (let i = 0; i < COLS; i++) {
      c.push(x % 5);
      x = Math.floor(x / 5);
    }
    return c;
  }
  function hitsOf(guess, track) {
    const a = unpack(guess);
    const b = unpack(track);
    let n = 0;
    for (let i = 0; i < COLS; i++) if (a[i] === b[i]) n++;
    return n;
  }
  function icoHtml(kind) {
    const src = PIECE_SRC[kind];
    if (!src) return "";
    const extra = kind === 4 ? " dy-ico-box" : "";
    return `<img class="dy-ico${extra}" src="${src}" alt="">`;
  }
  function cellHtml(kind, mark) {
    const filled = kind !== undefined && kind !== null;
    return `<div class="dy-cell${filled ? " has" : ""}${mark ? " mark-" + mark : ""}">${filled ? icoHtml(kind) : ""}</div>`;
  }
  function parseBet(b) {
    return {
      guess: Number(b.guess ?? b[0] ?? 0),
      lockBlock: Number(b.lockBlock ?? b[1] ?? 0),
      open: Boolean(b.open ?? b[2]),
      amount: b.amount ?? b[3] ?? 0n,
    };
  }
  function fmtLim(v) {
    const n = Number(ethers.formatEther(v || 0n));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function loadHist() {
    try {
      return JSON.parse(localStorage.getItem(HIST) || "[]");
    } catch (_) {
      return [];
    }
  }
  function saveHist(row) {
    const all = [row, ...loadHist()].slice(0, 8);
    try {
      localStorage.setItem(HIST, JSON.stringify(all));
    } catch (_) {}
    paintHist();
  }
  function paintGuess() {
    const row = $("trGuess");
    if (!row) return;
    const cells = phase === "edit" ? draft : unpack(pendingGuess);
    const truth = phase === "result" && shownTrack != null ? unpack(shownTrack) : null;
    let html = "";
    for (let i = 0; i < COLS; i++) {
      const mark = truth ? (cells[i] === truth[i] ? "hit" : "miss") : "";
      html += cellHtml(cells[i], mark);
    }
    row.innerHTML = html;
  }
  function paintKeys() {
    const wrap = $("trKeys");
    if (!wrap) return;
    wrap.innerHTML = KIND.map(
      (name, i) =>
        `<button type="button" class="dy-key" data-kind="${i}" aria-label="${tt(KIND_KEY[i])}">${icoHtml(i)}<span>${tt(KIND_KEY[i])}</span></button>`,
    ).join("");
  }
  function paintHist() {
    const wrap = $("trHist");
    const label = $("trHistLabel");
    if (!wrap) return;
    const rows = loadHist();
    if (label) {
      label.textContent = tt("hist");
      label.classList.toggle("hidden", !rows.length);
    }
    if (!rows.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = rows
      .map((r) => {
        const g = unpack(r.guess);
        const tr = unpack(r.track);
        const cells = g
          .map((k, i) => cellHtml(tr[i], g[i] === tr[i] ? "hit" : "miss"))
          .join("");
        return `<div class="track-hist-row">${cells}</div>`;
      })
      .join("");
  }
  function paintChips() {
    const wrap = root()?.querySelector(".track-chips");
    wrap?.classList.toggle("practice-only", !liveOk);
    wrap?.querySelectorAll(".track-chip").forEach((el) => {
      el.classList.toggle("on", Number(el.dataset.lim) === stakeLim);
    });
  }
  function paintLiveHint() {
    if (busy || pendingLock || phase !== "edit") return;
    if (!liveOk) {
      setStatus(tt("noTable"));
      return;
    }
    const cur = ($("trStatus")?.textContent || "").trim();
    if (!cur || cur === COPY.zh.noTable || cur === COPY.en.noTable) setStatus("");
  }
  function paintPhase() {
    const el = root();
    if (!el) return;
    el.classList.toggle("is-wait", phase === "wait");
    el.classList.toggle("is-result", phase === "result");
  }
  function paintGo() {
    const waiting = phase === "wait" || pendingLock > 0;
    const label = phase === "result" ? "next" : waiting ? (busy ? "opening" : "open") : "lock";
    setTxt("trGo", tt(label));
    $("trDel")?.toggleAttribute("disabled", phase !== "edit" || busy);
    paintPhase();
  }
  function applyCopy() {
    syncLang();
    setTxt("trKicker", tt("kicker"));
    setTxt("trLead", tt("lead"));
    setTxt("trStake", tt("stake"));
    setTxt("trGuessLabel", tt("guess"));
    setTxt("trTruthLabel", tt("truth"));
    setTxt("trR1", tt("r1"));
    setTxt("trR2", tt("r2"));
    setTxt("trR3", tt("r3"));
    setTxt("trR4", tt("r4"));
    setTxt("trR5", tt("r5"));
    setTxt("trR6", tt("r6"));
    setTxt("trPay2k", tt("pay2"));
    setTxt("trPay3k", tt("pay3"));
    setTxt("trPay4k", tt("pay4"));
    setTxt("trPay5k", tt("pay5"));
    setTxt("trHistLabel", tt("hist"));
    setTxt("trDel", typeof t === "function" ? t("dailyDel") : lang === "zh" ? "删除" : "DEL");
    paintKeys();
    paintChips();
    const z = root()?.querySelector('.track-chip[data-lim="0"]');
    if (z) z.textContent = tt("practice");
    paintGo();
    paintLiveHint();
  }
  function friendly(e) {
    const code = e?.code;
    const raw = String(e?.shortMessage || e?.reason || e?.message || e || "");
    const low = raw.toLowerCase();
    if (code === 4001 || code === "ACTION_REJECTED" || /reject|denied|user denied/.test(low)) return tt("rejected");
    if (/paused/.test(low)) return tt("paused");
    if (/\bopen\b/.test(low)) return tt("hasOpen");
    if (/\bwait\b/.test(low)) return tt("waitReady");
    if (/\bpool\b/.test(low)) return tt("noPool");
    if (/insufficient|transfer amount exceeds|exceeds balance/.test(low)) return tt("needLim");
    if (/no_wallet|ethereum/.test(low)) return tt("needWallet");
    if (/bsc|chain/.test(low) && /switch|4902/.test(low)) return tt("needBsc");
    return raw.slice(0, 120);
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function hidePop() {
    $("trPop")?.classList.add("hidden");
  }
  function paintTruth(mode, guess) {
    const row = $("trTruth");
    if (!row) return;
    if (mode === "empty") {
      row.classList.remove("is-sealed");
      row.innerHTML = Array.from({ length: COLS }, () => cellHtml()).join("");
      return;
    }
    if (mode === "sealed" || mode == null) {
      row.classList.add("is-sealed");
      row.innerHTML = Array.from(
        { length: COLS },
        () => `<div class="dy-cell sealed"><img class="dy-ico" src="${LOCK_SRC}" alt=""></div>`,
      ).join("");
      return;
    }
    row.classList.remove("is-sealed");
    const g = unpack(guess);
    const tr = unpack(mode);
    row.innerHTML = tr.map((k, i) => cellHtml(k, g[i] === k ? "hit" : "miss")).join("");
  }
  function showResult(hits, line, track, guess) {
    phase = "result";
    pendingLock = 0;
    pendingGuess = guess;
    shownTrack = track === "empty" ? null : track;
    paintGuess();
    paintTruth(track, guess);
    setStatus(hits == null ? line : `${hits}/5 · ${line}`);
    $("trStatus")?.setAttribute("data-hit", hits != null && hits >= 2 ? "1" : "0");
    paintGo();
    hidePop();
  }
  function resetRound() {
    phase = "edit";
    pendingLock = 0;
    pendingGuess = 0;
    shownTrack = null;
    draft = [];
    $("trStatus")?.removeAttribute("data-hit");
    setStatus("");
    paintGuess();
    paintTruth("empty");
    paintGo();
    paintLiveHint();
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

  async function checkLive() {
    try {
      const p = await readProvider();
      const code = await p.getCode(trackCfg().address || "0x");
      liveOk = Boolean(code && code !== "0x");
    } catch (_) {
      liveOk = false;
    }
    return liveOk;
  }

  async function loadOpenBet() {
    if (!account || !liveOk) {
      if (phase === "wait") pendingLock = 0;
      return null;
    }
    const g = gameContract(await readProvider());
    const b = parseBet(await g.bets(account));
    if (!b.open) {
      pendingLock = 0;
      return null;
    }
    pendingLock = b.lockBlock;
    pendingGuess = b.guess;
    pendingStake = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Number(ethers.formatEther(b.amount || 0n))));
    stakeLim = pendingStake || stakeLim;
    draft = unpack(pendingGuess);
    if (phase === "edit") phase = "wait";
    paintGuess();
    paintTruth("sealed");
    paintChips();
    paintGo();
    return b;
  }

  async function refreshStats() {
    syncAccount();
    let pool = 0n;
    let lim = 0n;
    await checkLive();
    try {
      if (liveOk) {
        const p = await readProvider();
        const g = gameContract(p);
        pool = await g.freePool();
        if (account) lim = await limContract(p).balanceOf(account);
        if (!busy) await loadOpenBet();
      }
    } catch (_) {}
    setTxt("trWallet", tt("bal", { lim: account ? fmtLim(lim) : "—", pool: liveOk ? fmtLim(pool) : "—" }));
    if (pendingLock && phase !== "result" && liveOk) {
      try {
        const n = Number(await (await readProvider()).getBlockNumber());
        const left = Math.max(0, pendingLock + 1 - n);
        setStatus(left ? tt("wait", { n: left }) : tt("waitReady"));
      } catch (_) {}
    } else {
      paintLiveHint();
    }
    paintGo();
  }

  function tapKind(i) {
    if (busy || phase !== "edit") return;
    if (draft.length >= COLS) return;
    draft.push(i);
    paintGuess();
  }
  function del() {
    if (busy || phase !== "edit") return;
    draft.pop();
    paintGuess();
  }

  function practiceTrack() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % 3125;
  }

  async function runPractice() {
    if (draft.length !== COLS) {
      $("trGuess")?.classList.remove("shake");
      void $("trGuess")?.offsetWidth;
      $("trGuess")?.classList.add("shake");
      setStatus(tt("filling"));
      return;
    }
    pendingGuess = pack(draft);
    phase = "wait";
    paintGuess();
    paintTruth("sealed");
    paintGo();
    setStatus(tt("flipping"));
    await sleep(420);
    const track = practiceTrack();
    const h = hitsOf(pendingGuess, track);
    saveHist({ guess: pendingGuess, track, hits: h, practice: 1 });
    const line = h >= 2 ? tt("practiceWin", { h }) : tt("practiceLose");
    showResult(h, line, track, pendingGuess);
  }

  async function waitForLock(lockBlock) {
    const p = await readProvider();
    for (let i = 0; i < 48; i++) {
      const n = Number(await p.getBlockNumber());
      const left = Math.max(0, lockBlock + 1 - n);
      if (n > lockBlock) {
        setStatus(tt("waitReady"));
        return true;
      }
      setStatus(tt("wait", { n: left }));
      paintGo();
      await sleep(1500);
    }
    setStatus(tt("waitReady"));
    return false;
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

  async function openRound() {
    if (!pendingLock) {
      await loadOpenBet();
      if (!pendingLock) return;
    }
    if (!account) await connect();
    await ensureBsc();
    await waitForLock(pendingLock);
    setStatus(tt("opening"));
    paintGo();
    const g = gameContract(await signer());
    const tx = await g.settle();
    const rec = await tx.wait();
    const ev = parseSettled(g, rec);
    const guess = pendingGuess;
    if (ev?.name === "Refunded") {
      showResult(null, tt("refund"), "empty", guess);
    } else if (ev?.name === "Settled") {
      const trackN = Number(ev.args.track);
      const h = Number(ev.args.hits);
      const pay = Number(ethers.formatEther(ev.args.payout || 0n));
      saveHist({ guess, track: trackN, hits: h, practice: 0 });
      const line = h >= 2 ? tt("win", { h, n: String(pay) }) : tt("lose");
      showResult(h, line, trackN, guess);
    } else {
      setStatus(tt("refund"));
      phase = "edit";
      pendingLock = 0;
      paintGo();
    }
    await refreshStats();
  }

  async function liveBet() {
    if (draft.length !== COLS) {
      $("trGuess")?.classList.remove("shake");
      void $("trGuess")?.offsetWidth;
      $("trGuess")?.classList.add("shake");
      setStatus(tt("filling"));
      return;
    }
    syncAccount();
    if (!account) account = await connect();
    if (!account) throw new Error("NO_WALLET");
    await ensureBsc();
    await checkLive();
    if (!liveOk) {
      toast(tt("noTable"));
      setStatus(tt("noTable"));
      return;
    }
    const open = await loadOpenBet();
    if (open) {
      phase = "wait";
      paintTruth("sealed");
      paintGuess();
      paintGo();
      setStatus(tt("resume"));
      toast(tt("hasOpen"));
      return;
    }
    const s = await signer();
    const g = gameContract(s);
    const lim = limContract(s);
    const amount = UNIT * BigInt(stakeLim);
    const cover = amount * 7n;
    const [free, bal] = await Promise.all([g.freePool(), lim.balanceOf(account)]);
    if (free < cover) {
      toast(tt("noPool"));
      setStatus(tt("noPool"));
      return;
    }
    if (bal < amount) {
      toast(tt("needLim"));
      setStatus(tt("needLim"));
      return;
    }
    const allow = await lim.allowance(account, trackCfg().address);
    if (allow < amount) {
      setStatus(tt("approve"));
      toast(tt("approve"));
      const txA = await lim.approve(trackCfg().address, ethers.MaxUint256);
      await txA.wait();
    }
    const guess = pack(draft);
    setStatus(tt("paying", { n: stakeLim }));
    const tx = await g.placeBet(guess, amount);
    await tx.wait();
    const b = parseBet(await g.bets(account));
    pendingLock = b.lockBlock;
    pendingGuess = b.guess;
    pendingStake = stakeLim;
    phase = "wait";
    paintGuess();
    paintTruth("sealed");
    paintGo();
    setStatus(tt("wait", { n: 2 }));
  }

  async function onGo() {
    if (busy) return;
    if (phase === "result") {
      resetRound();
      return;
    }
    busy = true;
    paintGo();
    try {
      if (pendingLock || phase === "wait") await openRound();
      else if (stakeLim === 0) await runPractice();
      else await liveBet();
    } catch (e) {
      const msg = friendly(e);
      setStatus(msg);
      toast(msg);
    } finally {
      busy = false;
      paintGo();
      refreshStats().catch(() => {});
    }
  }

  async function resumeIfOpen() {
    if (busy || phase === "result") return;
    syncAccount();
    if (!account) return;
    await checkLive();
    const b = await loadOpenBet();
    if (b) setStatus(tt("resume"));
  }

  function bindUi() {
    const rootEl = root();
    if (!rootEl || rootEl.dataset.bound) return;
    rootEl.dataset.bound = "1";
    rootEl.addEventListener("click", (e) => {
      const key = e.target.closest("[data-kind]");
      if (key && key.closest("#trKeys")) {
        tapKind(Number(key.dataset.kind));
        return;
      }
      const chip = e.target.closest(".track-chip");
      if (chip && phase === "edit" && !busy) {
        const n = Number(chip.dataset.lim);
        if (!liveOk && n > 0) {
          stakeLim = 0;
          paintChips();
          setStatus(tt("noTable"));
          return;
        }
        stakeLim = n;
        paintChips();
        if (!pendingLock) setStatus(liveOk ? "" : tt("noTable"));
        return;
      }
      if (e.target.closest("#trDel")) {
        del();
        return;
      }
      if (e.target.closest("#trGo")) {
        onGo();
        return;
      }
      if (e.target.closest("#trPopOk") || e.target.id === "trPop") hidePop();
    });
  }

  function bootTrack() {
    if (!root() || bootTrack._on) return;
    bootTrack._on = true;
    syncAccount();
    bindUi();
    paintGuess();
    paintTruth("empty");
    paintHist();
    applyCopy();
    paintLiveHint();
    refreshStats().catch(() => {});
    window.addEventListener("catbox-wallet", () => {
      syncAccount();
      refreshStats().catch(() => {});
      resumeIfOpen().catch(() => {});
    });
    setInterval(() => {
      if (busy) return;
      refreshStats().catch(() => {});
    }, 2000);
  }

  window.bootTrack = bootTrack;
  window.refreshTrack = () => {
    applyCopy();
    return refreshStats();
  };
  window.refreshTrackCopy = applyCopy;
  bootTrack();
})();
