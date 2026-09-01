(function () {
  const COL = 100;
  const CATBOX = "https://catboxrun.github.io/catbox-dash/#airdrop";
  const TG = "https://t.me/Liminal_Official";
  const LANGS = [
    { id: "en", label: "EN" },
    { id: "zh", label: "中" },
    { id: "ja", label: "日" },
    { id: "ko", label: "한" },
    { id: "vi", label: "VI" },
    { id: "id", label: "ID" },
    { id: "fil", label: "PH" },
    { id: "th", label: "TH" },
    { id: "ru", label: "RU" },
  ];
  const HTML_LANG = { en: "en", zh: "zh-CN", ja: "ja", ko: "ko", vi: "vi", id: "id", fil: "fil", th: "th", ru: "ru" };
  const I18N = {
    en: {
      dropBoard: "SETTLEMENT AIRDROP",
      dropLead: "The list is compiled from Telegram and X campaign comments (screenshot and wallet), then verified — just over 3,000 wallets. Look up your amount on this page and claim in Catbox to the same address.",
      dropCta: "CLAIM IN CATBOX",
      dropDeadlineLine: "Claims close 15 September 2026, 23:59 Singapore time (UTC+8).",
      dropSearchLabel: "YOUR ADDRESS",
      dropSearchPh: "Paste a 0x address",
      dropListTitle: "LIST",
      dropRulesTitle: "RULES",
      dropListNote: "100 addresses per column. Use the column control to find yours.",
      dropColJump: "Column",
      dropColAddr: "ADDRESS",
      dropColAmt: "LIM",
      dropColOpt: "Column {n} · {from}–{to}",
      dropMissTitle: "NOT ON THE LIST?",
      dropMissHint: "If you submitted a screenshot and address on Telegram or X but are not listed, send the wallet for an on-chain check.",
      dropMissNotePh: "Telegram / note (optional)",
      dropMissGo: "SEND",
      dropMissOk: "Copied. Paste it in the Telegram group.",
      dropMissBad: "A complete 0x address is required.",
      dropNotFound: "This address is not on the list. If you submitted a screenshot and wallet on Telegram or X, send it from the Rules tab.",
      dropStatLim: "LIM",
      dropStatWallets: "WALLETS ON THE LIST",
      dropStatChain: "ON-CHAIN CREDIT",
      ruleOriginTitle: "Eligibility",
      ruleOriginBody: "This round is for participants who submitted a screenshot and wallet in Telegram and X campaign comments. After verification, just over 3,000 addresses remain. Only listed addresses may claim; this is not an open distribution.",
      ruleClaimTitle: "How to claim",
      ruleClaimBody: "Confirm your address and amount on this page, then open Catbox and connect the same wallet. LIM is credited on-chain to that address, with no intermediate account.",
      ruleDeadlineTitle: "Deadline",
      ruleDeadlineBody: "Claims must be completed by 15 September 2026, 23:59 Singapore time (UTC+8). Amounts still unclaimed after that time will be redistributed as set out below.",
      ruleAfterTitle: "After the deadline",
      ruleAfterBody: "Unclaimed LIM is not withdrawn. 50% is airdropped again to addresses that did not claim; 50% is allocated to Catbox prize pools for the daily board, invite board, and other mini-games.",
      ruleAmtTitle: "Allocation",
      ruleAmtBody: "The total is 100,000 LIM. Daily ranks 1–10 receive 100 LIM each; ranks 11–40 receive 50 LIM each. Remaining listed addresses split the rest equally, about {share} LIM each.",
      tgTitle: "TELEGRAM",
      tgBtn: "JOIN THE GROUP",
      tgBody: "Claim reminders and follow-up notices are posted in the group.",
      privacyTitle: "PRIVACY TRANSFER",
      privacyBtn: "PRIVACY TRANSFER",
      privacyBody: "Transfers are private by default. The path is not displayed.",
      catboxTitle: "CATBOX",
      catboxBtn: "ANONYMOUS DISTRIBUTION",
      catboxBody: "On-chain claim to your wallet. No custodial account in between.",
    },
    zh: {
      dropBoard: "结算空投",
      dropLead: "名单来自 Telegram 与 X 活动评论中提交的截图与地址，经核对后共三千余个钱包。请在本页查询额度，于 Catbox 领取至同一地址。",
      dropCta: "前往 Catbox 领取",
      dropDeadlineLine: "领取截止：2026年9月15日 23:59（新加坡时间，UTC+8）",
      dropSearchLabel: "你的地址",
      dropSearchPh: "粘贴 0x 地址",
      dropListTitle: "名单",
      dropRulesTitle: "规则",
      dropListNote: "每栏 100 个地址，可翻栏查询。",
      dropColJump: "分栏",
      dropColAddr: "地址",
      dropColAmt: "LIM",
      dropColOpt: "第 {n} 栏 · {from}–{to}",
      dropMissTitle: "不在名单？",
      dropMissHint: "若已在 Telegram 或 X 提交截图与地址但仍未列入，请发送钱包以便链上核对。",
      dropMissNotePh: "Telegram / 备注（选填）",
      dropMissGo: "提交",
      dropMissOk: "已复制。请粘贴至 Telegram 群。",
      dropMissBad: "请提供完整 0x 地址。",
      dropNotFound: "该地址不在本名单。若已在 Telegram 或 X 提交截图与钱包，请于规则页提交核对。",
      dropStatLim: "LIM",
      dropStatWallets: "名单地址",
      dropStatChain: "链上到账",
      ruleOriginTitle: "领取资格",
      ruleOriginBody: "本轮空投面向在 Telegram 与 X 活动评论中提交截图与钱包、并经核对列入名单的地址。名单内共三千余个地址。仅名单地址可领取，非公开申领。",
      ruleClaimTitle: "领取方式",
      ruleClaimBody: "请先在本页确认是否在列及可领额度，再打开 Catbox，连接同一钱包。LIM 将链上转入该地址，不经中间账户。",
      ruleDeadlineTitle: "领取截止时间",
      ruleDeadlineBody: "领取须于 2026年9月15日 23:59（新加坡时间，UTC+8）前完成。逾期未领部分按下列规则处理。",
      ruleAfterTitle: "截止后的处理",
      ruleAfterBody: "未领取的 LIM 不予收回。其中 50% 再次空投给当期未领取的地址；另外 50% 计入 Catbox 日榜、邀请榜及其他小游戏奖池。",
      ruleAmtTitle: "额度规则",
      ruleAmtBody: "总额 100,000 LIM。日榜第 1–10 名各领 100 LIM，第 11–40 名各领 50 LIM；其余名单地址均分剩余额度，约每人 {share} LIM。",
      tgTitle: "TELEGRAM",
      tgBtn: "加入群组",
      tgBody: "领取提醒与后续通知以群内公告为准。",
      privacyTitle: "隐私转账",
      privacyBtn: "转账默认不公开路径",
      privacyBody: "LIM 转账默认不展示路径。",
      catboxTitle: "CATBOX",
      catboxBtn: "匿名分发",
      catboxBody: "链上领取至本人钱包，不经托管账户。",
    },
    ja: {
      dropBoard: "決算エアドロップ",
      dropLead: "名簿は Telegram および X のキャンペーンコメントに提出されたスクリーンショットとアドレスを照合したもので、3,000 件超のウォレットです。本ページで数量を確認し、Catbox で同一アドレスへお受け取りください。",
      dropCta: "Catbox で受け取る",
      dropDeadlineLine: "受取期限：2026年9月15日 23:59（シンガポール時間、UTC+8）",
      dropSearchLabel: "ご本人のアドレス",
      dropSearchPh: "0x アドレスを貼り付け",
      dropListTitle: "名簿",
      dropRulesTitle: "規則",
      dropListNote: "1欄 100 件。欄を切り替えて検索できます。",
      dropColJump: "欄",
      dropColAddr: "アドレス",
      dropColAmt: "LIM",
      dropColOpt: "第 {n} 欄 · {from}–{to}",
      dropMissTitle: "名簿にない場合",
      dropMissHint: "Telegram または X にスクリーンショットとアドレスを提出済みで名簿にない場合は、ウォレットを送信してください。オンチェーンで照合します。",
      dropMissNotePh: "Telegram / メモ（任意）",
      dropMissGo: "送信",
      dropMissOk: "コピーしました。Telegram グループに貼り付けてください。",
      dropMissBad: "完全な 0x アドレスが必要です。",
      dropNotFound: "本名簿にありません。Telegram または X に提出済みの場合は、規則タブから送信してください。",
      dropStatLim: "LIM",
      dropStatWallets: "名簿のアドレス",
      dropStatChain: "オンチェーン入金",
      ruleOriginTitle: "受取資格",
      ruleOriginBody: "本ラウンドは、Telegram および X のキャンペーンコメントにスクリーンショットとウォレットを提出し、照合のうえ名簿に掲載されたアドレスが対象です。名簿は 3,000 件超です。名簿掲載アドレスのみ受取可能で、公開配布ではありません。",
      ruleClaimTitle: "受取方法",
      ruleClaimBody: "本ページで掲載の有無と数量を確認したうえで Catbox を開き、同一ウォレットを接続してください。LIM は当該アドレスへオンチェーンで入金され、中間口座は用いません。",
      ruleDeadlineTitle: "受取期限",
      ruleDeadlineBody: "受取は 2026年9月15日 23:59（シンガポール時間、UTC+8）までに完了してください。期限後の未受取分は下記のとおり再配分します。",
      ruleAfterTitle: "期限後の取扱い",
      ruleAfterBody: "未受取の LIM は回収しません。50% は未受取アドレスへ再エアドロップし、50% は Catbox の日次ランキング、招待ランキング、その他ミニゲームの賞池に充当します。",
      ruleAmtTitle: "配分規則",
      ruleAmtBody: "総額は 100,000 LIM です。日次ランキング 1–10 位は各 100 LIM、11–40 位は各 50 LIM。その他の名簿アドレスは残額を均等割し、おおよそ {share} LIM です。",
      tgTitle: "TELEGRAM",
      tgBtn: "グループへ",
      tgBody: "受取案内および以降の通知はグループの告知に従います。",
      privacyTitle: "プライバシー送金",
      privacyBtn: "送金経路は非公開",
      privacyBody: "LIM 送金の経路は既定で表示されません。",
      catboxTitle: "CATBOX",
      catboxBtn: "匿名配布",
      catboxBody: "ご本人のウォレットへオンチェーン受取。カストディ口座は用いません。",
    },
    ko: {
      dropBoard: "정산 에어드롭",
      dropLead: "명단은 Telegram과 X 캠페인 댓글에 제출된 스크린샷과 주소를 대조한 결과이며, 3,000여 개 지갑입니다. 이 페이지에서 수량을 확인한 뒤 Catbox에서 동일 주소로 수령하십시오.",
      dropCta: "Catbox에서 수령",
      dropDeadlineLine: "수령 마감: 2026년 9월 15일 23:59 (싱가포르 시간, UTC+8)",
      dropSearchLabel: "본인 주소",
      dropSearchPh: "0x 주소 붙여넣기",
      dropListTitle: "명단",
      dropRulesTitle: "규정",
      dropListNote: "열당 100개 주소. 열을 넘겨 조회할 수 있습니다.",
      dropColJump: "열",
      dropColAddr: "주소",
      dropColAmt: "LIM",
      dropColOpt: "{n}열 · {from}–{to}",
      dropMissTitle: "명단에 없습니까?",
      dropMissHint: "Telegram 또는 X에 스크린샷과 주소를 제출했으나 명단에 없다면 지갑을 보내 주십시오. 온체인으로 대조합니다.",
      dropMissNotePh: "Telegram / 메모 (선택)",
      dropMissGo: "제출",
      dropMissOk: "복사되었습니다. Telegram 그룹에 붙여넣으십시오.",
      dropMissBad: "완전한 0x 주소가 필요합니다.",
      dropNotFound: "이 명단에 없습니다. Telegram 또는 X에 제출했다면 규정 탭에서 보내 주십시오.",
      dropStatLim: "LIM",
      dropStatWallets: "명단 주소",
      dropStatChain: "온체인 입금",
      ruleOriginTitle: "수령 자격",
      ruleOriginBody: "본 라운드는 Telegram과 X 캠페인 댓글에 스크린샷과 지갑을 제출하고, 대조 후 명단에 오른 주소를 대상으로 합니다. 명단은 3,000여 개입니다. 명단 주소만 수령할 수 있으며 공개 신청이 아닙니다.",
      ruleClaimTitle: "수령 방법",
      ruleClaimBody: "이 페이지에서 등재 여부와 수량을 확인한 뒤 Catbox를 열고 동일 지갑을 연결하십시오. LIM은 해당 주소로 온체인 입금되며 중간 계정을 거치지 않습니다.",
      ruleDeadlineTitle: "수령 마감",
      ruleDeadlineBody: "수령은 2026년 9월 15일 23:59 (싱가포르 시간, UTC+8)까지 완료해야 합니다. 기한 후 미수령분은 아래 규정에 따라 재배분합니다.",
      ruleAfterTitle: "마감 후 처리",
      ruleAfterBody: "미수령 LIM은 회수하지 않습니다. 50%는 당시 수령하지 않은 주소에 다시 에어드롭하고, 50%는 Catbox 일간 순위, 초대 순위 및 기타 미니게임 상금 풀에 배정합니다.",
      ruleAmtTitle: "배분 규정",
      ruleAmtBody: "총액은 100,000 LIM입니다. 일간 순위 1–10위는 각 100 LIM, 11–40위는 각 50 LIM입니다. 나머지 명단 주소는 잔액을 균등 분할하며 약 {share} LIM입니다.",
      tgTitle: "TELEGRAM",
      tgBtn: "그룹 참여",
      tgBody: "수령 안내와 후속 공지는 그룹 공지를 따릅니다.",
      privacyTitle: "프라이버시 전송",
      privacyBtn: "전송 경로 비공개",
      privacyBody: "LIM 전송 경로는 기본으로 표시되지 않습니다.",
      catboxTitle: "CATBOX",
      catboxBtn: "익명 분배",
      catboxBody: "본인 지갑으로 온체인 수령. 수탁 계정을 거치지 않습니다.",
    },
    vi: {
      dropBoard: "AIRDROP QUYẾT TOÁN",
      dropLead: "Danh sách được lập từ bình luận chiến dịch trên Telegram và X (ảnh chụp và ví), đã đối chiếu — hơn 3.000 ví. Tra cứu số lượng tại trang này và nhận tại Catbox về cùng địa chỉ.",
      dropCta: "NHẬN TẠI CATBOX",
      dropDeadlineLine: "Hạn nhận: 15 tháng 9 năm 2026, 23:59 (giờ Singapore, UTC+8).",
      dropSearchLabel: "ĐỊA CHỈ CỦA BẠN",
      dropSearchPh: "Dán địa chỉ 0x",
      dropListTitle: "DANH SÁCH",
      dropRulesTitle: "QUY TẮC",
      dropListNote: "100 địa chỉ mỗi cột. Chuyển cột để tra cứu.",
      dropColJump: "Cột",
      dropColAddr: "ĐỊA CHỈ",
      dropColAmt: "LIM",
      dropColOpt: "Cột {n} · {from}–{to}",
      dropMissTitle: "KHÔNG CÓ TRONG DANH SÁCH?",
      dropMissHint: "Nếu đã gửi ảnh chụp và địa chỉ trên Telegram hoặc X nhưng chưa có trong danh sách, hãy gửi ví để đối chiếu on-chain.",
      dropMissNotePh: "Telegram / ghi chú (không bắt buộc)",
      dropMissGo: "GỬI",
      dropMissOk: "Đã sao chép. Dán vào nhóm Telegram.",
      dropMissBad: "Cần địa chỉ 0x đầy đủ.",
      dropNotFound: "Địa chỉ này không có trong danh sách. Nếu đã gửi trên Telegram hoặc X, hãy gửi từ tab Quy tắc.",
      dropStatLim: "LIM",
      dropStatWallets: "ĐỊA CHỈ TRONG DANH SÁCH",
      dropStatChain: "GHI CÓ ON-CHAIN",
      ruleOriginTitle: "Điều kiện nhận",
      ruleOriginBody: "Vòng này dành cho người đã gửi ảnh chụp và ví trong bình luận chiến dịch Telegram và X, và được đối chiếu vào danh sách. Danh sách có hơn 3.000 địa chỉ. Chỉ địa chỉ trong danh sách được nhận; không phải phân phối mở.",
      ruleClaimTitle: "Cách nhận",
      ruleClaimBody: "Xác nhận địa chỉ và số lượng trên trang này, sau đó mở Catbox và kết nối cùng ví. LIM được ghi có on-chain tới địa chỉ đó, không qua tài khoản trung gian.",
      ruleDeadlineTitle: "Thời hạn",
      ruleDeadlineBody: "Phải hoàn tất nhận trước 15 tháng 9 năm 2026, 23:59 (giờ Singapore, UTC+8). Phần chưa nhận sau thời hạn sẽ được phân bổ lại theo quy tắc dưới đây.",
      ruleAfterTitle: "Sau thời hạn",
      ruleAfterBody: "LIM chưa nhận không bị thu hồi. 50% được airdrop lại cho các địa chỉ chưa nhận; 50% đưa vào quỹ thưởng Catbox cho bảng ngày, bảng mời và các trò chơi nhỏ khác.",
      ruleAmtTitle: "Quy tắc phân bổ",
      ruleAmtBody: "Tổng 100.000 LIM. Hạng ngày 1–10 mỗi địa chỉ 100 LIM; hạng 11–40 mỗi địa chỉ 50 LIM. Các địa chỉ còn lại trong danh sách chia đều phần còn lại, khoảng {share} LIM mỗi địa chỉ.",
      tgTitle: "TELEGRAM",
      tgBtn: "THAM GIA NHÓM",
      tgBody: "Nhắc nhận và thông báo tiếp theo được đăng trong nhóm.",
      privacyTitle: "CHUYỂN KHOẢN RIÊNG TƯ",
      privacyBtn: "ĐƯỜNG ĐI KHÔNG HIỂN THỊ",
      privacyBody: "Chuyển LIM mặc định không hiển thị đường đi.",
      catboxTitle: "CATBOX",
      catboxBtn: "PHÂN PHỐI ẨN DANH",
      catboxBody: "Nhận on-chain về ví của bạn. Không qua tài khoản lưu ký.",
    },
    id: {
      dropBoard: "AIRDROP PENYELESAIAN",
      dropLead: "Daftar disusun dari komentar kampanye Telegram dan X (tangkapan layar dan dompet), lalu diverifikasi — lebih dari 3.000 dompet. Periksa jumlah di halaman ini dan klaim di Catbox ke alamat yang sama.",
      dropCta: "KLAIM DI CATBOX",
      dropDeadlineLine: "Batas klaim: 15 September 2026, 23:59 (waktu Singapura, UTC+8).",
      dropSearchLabel: "ALAMAT ANDA",
      dropSearchPh: "Tempel alamat 0x",
      dropListTitle: "DAFTAR",
      dropRulesTitle: "ATURAN",
      dropListNote: "100 alamat per kolom. Gunakan kontrol kolom untuk mencari.",
      dropColJump: "Kolom",
      dropColAddr: "ALAMAT",
      dropColAmt: "LIM",
      dropColOpt: "Kolom {n} · {from}–{to}",
      dropMissTitle: "TIDAK ADA DI DAFTAR?",
      dropMissHint: "Jika Anda telah mengirim tangkapan layar dan alamat di Telegram atau X tetapi tidak terdaftar, kirim dompet untuk pemeriksaan on-chain.",
      dropMissNotePh: "Telegram / catatan (opsional)",
      dropMissGo: "KIRIM",
      dropMissOk: "Disalin. Tempel di grup Telegram.",
      dropMissBad: "Diperlukan alamat 0x lengkap.",
      dropNotFound: "Alamat ini tidak ada di daftar. Jika sudah mengirim di Telegram atau X, kirim dari tab Aturan.",
      dropStatLim: "LIM",
      dropStatWallets: "ALAMAT DALAM DAFTAR",
      dropStatChain: "KREDIT ON-CHAIN",
      ruleOriginTitle: "Kelayakan",
      ruleOriginBody: "Putaran ini untuk peserta yang mengirim tangkapan layar dan dompet di komentar kampanye Telegram dan X, lalu diverifikasi ke dalam daftar. Daftar berisi lebih dari 3.000 alamat. Hanya alamat terdaftar yang dapat klaim; ini bukan distribusi terbuka.",
      ruleClaimTitle: "Cara klaim",
      ruleClaimBody: "Konfirmasikan alamat dan jumlah di halaman ini, lalu buka Catbox dan hubungkan dompet yang sama. LIM dikreditkan on-chain ke alamat tersebut, tanpa akun perantara.",
      ruleDeadlineTitle: "Batas waktu",
      ruleDeadlineBody: "Klaim harus diselesaikan paling lambat 15 September 2026, 23:59 (waktu Singapura, UTC+8). Jumlah yang belum diklaim setelah itu akan didistribusikan ulang sesuai aturan di bawah.",
      ruleAfterTitle: "Setelah batas waktu",
      ruleAfterBody: "LIM yang tidak diklaim tidak ditarik. 50% di-airdrop lagi ke alamat yang tidak klaim; 50% dialokasikan ke kumpulan hadiah Catbox untuk papan harian, papan undangan, dan mini-game lainnya.",
      ruleAmtTitle: "Aturan alokasi",
      ruleAmtBody: "Total 100.000 LIM. Peringkat harian 1–10 masing-masing 100 LIM; peringkat 11–40 masing-masing 50 LIM. Alamat daftar lainnya membagi sisa secara merata, sekitar {share} LIM.",
      tgTitle: "TELEGRAM",
      tgBtn: "GABUNG GRUP",
      tgBody: "Pengingat klaim dan pemberitahuan lanjutan diumumkan di grup.",
      privacyTitle: "TRANSFER PRIVASI",
      privacyBtn: "JALUR TIDAK DITAMPILKAN",
      privacyBody: "Transfer LIM secara default tidak menampilkan jalur.",
      catboxTitle: "CATBOX",
      catboxBtn: "DISTRIBUSI ANONIM",
      catboxBody: "Klaim on-chain ke dompet Anda. Tanpa akun kustodian.",
    },
    fil: {
      dropBoard: "SETTLEMENT AIRDROP",
      dropLead: "Ang listahan ay mula sa mga komento sa Telegram at X campaign (screenshot at wallet), na na-verify — mahigit 3,000 wallet. Tingnan ang halaga sa pahinang ito at i-claim sa Catbox sa parehong address.",
      dropCta: "I-CLAIM SA CATBOX",
      dropDeadlineLine: "Huling araw ng claim: 15 Setyembre 2026, 23:59 (oras ng Singapore, UTC+8).",
      dropSearchLabel: "IYONG ADDRESS",
      dropSearchPh: "I-paste ang 0x address",
      dropListTitle: "LISTAHAN",
      dropRulesTitle: "MGA TUNTUNIN",
      dropListNote: "100 address bawat column. Gamitin ang column control para maghanap.",
      dropColJump: "Column",
      dropColAddr: "ADDRESS",
      dropColAmt: "LIM",
      dropColOpt: "Column {n} · {from}–{to}",
      dropMissTitle: "WALA SA LISTAHAN?",
      dropMissHint: "Kung nagpadala ka ng screenshot at address sa Telegram o X pero wala sa listahan, ipadala ang wallet para sa on-chain na tseke.",
      dropMissNotePh: "Telegram / tala (opsyonal)",
      dropMissGo: "IPADALA",
      dropMissOk: "Nakopya. I-paste sa Telegram group.",
      dropMissBad: "Kailangan ang buong 0x address.",
      dropNotFound: "Wala ang address na ito sa listahan. Kung nagpadala sa Telegram o X, ipadala mula sa tab ng Tuntunin.",
      dropStatLim: "LIM",
      dropStatWallets: "MGA ADDRESS SA LISTAHAN",
      dropStatChain: "ON-CHAIN NA CREDIT",
      ruleOriginTitle: "Sino ang maaaring mag-claim",
      ruleOriginBody: "Ang round na ito ay para sa mga kalahok na nagpadala ng screenshot at wallet sa mga komento ng Telegram at X campaign, at na-verify sa listahan. Mahigit 3,000 address. Tanging naka-listang address ang maaaring mag-claim; hindi ito open distribution.",
      ruleClaimTitle: "Paano mag-claim",
      ruleClaimBody: "Kumpirmahin ang address at halaga sa pahinang ito, pagkatapos ay buksan ang Catbox at ikonekta ang parehong wallet. Ang LIM ay ikikredito on-chain sa address na iyon, walang intermediate na account.",
      ruleDeadlineTitle: "Deadline",
      ruleDeadlineBody: "Dapat tapusin ang claim sa o bago ang 15 Setyembre 2026, 23:59 (oras ng Singapore, UTC+8). Ang hindi na-claim pagkatapos nito ay muling ipamamahagi ayon sa mga tuntunin sa ibaba.",
      ruleAfterTitle: "Pagkatapos ng deadline",
      ruleAfterBody: "Ang hindi na-claim na LIM ay hindi kinukuha. 50% ay ia-airdrop muli sa mga address na hindi nag-claim; 50% ay ilalaan sa mga prize pool ng Catbox para sa daily board, invite board, at iba pang mini-game.",
      ruleAmtTitle: "Alokasyon",
      ruleAmtBody: "Kabuuang 100,000 LIM. Daily ranks 1–10: 100 LIM bawat isa; ranks 11–40: 50 LIM bawat isa. Ang natitirang naka-listang address ay pantay na hahati sa natitira, humigit-kumulang {share} LIM.",
      tgTitle: "TELEGRAM",
      tgBtn: "SUMALI SA GRUPO",
      tgBody: "Mga paalala sa claim at susunod na abiso ay naka-post sa grupo.",
      privacyTitle: "PRIVACY TRANSFER",
      privacyBtn: "HINDI IPINAPAKITA ANG PATH",
      privacyBody: "Hindi ipinapakita ang path ng LIM transfer bilang default.",
      catboxTitle: "CATBOX",
      catboxBtn: "ANONYMOUS DISTRIBUTION",
      catboxBody: "On-chain claim sa iyong wallet. Walang custodial account.",
    },
    th: {
      dropBoard: "แอร์ดรอปสรุปผล",
      dropLead: "รายชื่อรวบรวมจากความคิดเห็นแคมเปญใน Telegram และ X (ภาพหน้าจอและวอลเล็ต) แล้วตรวจสอบแล้ว — กว่า 3,000 วอลเล็ต ตรวจสอบจำนวนในหน้านี้แล้วรับที่ Catbox ไปยังที่อยู่เดียวกัน",
      dropCta: "รับที่ CATBOX",
      dropDeadlineLine: "ปิดรับ: 15 กันยายน 2026 เวลา 23:59 (เวลาสิงคโปร์ UTC+8)",
      dropSearchLabel: "ที่อยู่ของคุณ",
      dropSearchPh: "วางที่อยู่ 0x",
      dropListTitle: "รายชื่อ",
      dropRulesTitle: "ข้อกำหนด",
      dropListNote: "100 ที่อยู่ต่อคอลัมน์ สลับคอลัมน์เพื่อค้นหา",
      dropColJump: "คอลัมน์",
      dropColAddr: "ที่อยู่",
      dropColAmt: "LIM",
      dropColOpt: "คอลัมน์ {n} · {from}–{to}",
      dropMissTitle: "ไม่อยู่ในรายชื่อ?",
      dropMissHint: "หากส่งภาพหน้าจอและที่อยู่ใน Telegram หรือ X แล้วแต่ยังไม่อยู่ในรายชื่อ ให้ส่งวอลเล็ตเพื่อตรวจสอบบนเชน",
      dropMissNotePh: "Telegram / หมายเหตุ (ไม่บังคับ)",
      dropMissGo: "ส่ง",
      dropMissOk: "คัดลอกแล้ว วางในกลุ่ม Telegram",
      dropMissBad: "ต้องใช้ที่อยู่ 0x ครบถ้วน",
      dropNotFound: "ที่อยู่นี้ไม่อยู่ในรายชื่อ หากส่งใน Telegram หรือ X แล้ว ให้ส่งจากแท็บข้อกำหนด",
      dropStatLim: "LIM",
      dropStatWallets: "ที่อยู่ในรายชื่อ",
      dropStatChain: "เครดิตบนเชน",
      ruleOriginTitle: "คุณสมบัติผู้รับ",
      ruleOriginBody: "รอบนี้สำหรับผู้ที่ส่งภาพหน้าจอและวอลเล็ตในความคิดเห็นแคมเปญ Telegram และ X และผ่านการตรวจสอบเข้าสู่รายชื่อ รายชื่อมีกว่า 3,000 ที่อยู่ เฉพาะที่อยู่ในรายชื่อเท่านั้นที่รับได้ ไม่ใช่การแจกเปิด",
      ruleClaimTitle: "วิธีรับ",
      ruleClaimBody: "ยืนยันที่อยู่และจำนวนในหน้านี้ จากนั้นเปิด Catbox และเชื่อมต่อวอลเล็ตเดียวกัน LIM จะเข้าสู่ที่อยู่นั้นบนเชน โดยไม่มีบัญชีตัวกลาง",
      ruleDeadlineTitle: "กำหนดเวลา",
      ruleDeadlineBody: "ต้องรับให้เสร็จภายใน 15 กันยายน 2026 เวลา 23:59 (เวลาสิงคโปร์ UTC+8) ส่วนที่ยังไม่รับหลังจากนั้นจะถูกจัดสรรใหม่ตามข้อกำหนดด้านล่าง",
      ruleAfterTitle: "หลังกำหนดเวลา",
      ruleAfterBody: "LIM ที่ยังไม่รับจะไม่ถูกถอนคืน 50% จะแอร์ดรอปอีกครั้งให้ที่อยู่ที่ยังไม่รับ 50% เข้าพูลรางวัล Catbox สำหรับกระดานรายวัน กระดานเชิญ และมินิเกมอื่น",
      ruleAmtTitle: "หลักเกณฑ์การจัดสรร",
      ruleAmtBody: "รวม 100,000 LIM อันดับรายวัน 1–10 คนละ 100 LIM อันดับ 11–40 คนละ 50 LIM ที่เหลือในรายชื่อแบ่งส่วนที่เหลือเท่ากัน ประมาณ {share} LIM",
      tgTitle: "TELEGRAM",
      tgBtn: "เข้าร่วมกลุ่ม",
      tgBody: "การแจ้งเตือนการรับและประกาศถัดไปอยู่ในกลุ่ม",
      privacyTitle: "โอนแบบเป็นส่วนตัว",
      privacyBtn: "ไม่แสดงเส้นทาง",
      privacyBody: "การโอน LIM ไม่แสดงเส้นทางโดยค่าเริ่มต้น",
      catboxTitle: "CATBOX",
      catboxBtn: "การแจกแบบไม่ระบุตัวตน",
      catboxBody: "รับบนเชนเข้าวอลเล็ตของคุณ ไม่ผ่านบัญชีคัสโตเดียน",
    },
    ru: {
      dropBoard: "РАСЧЁТНЫЙ ЭИРДРОП",
      dropLead: "Список составлен по комментариям кампании в Telegram и X (скриншот и кошелёк) и проверен — более 3 000 кошельков. Проверьте сумму на этой странице и получите LIM в Catbox на тот же адрес.",
      dropCta: "ПОЛУЧИТЬ В CATBOX",
      dropDeadlineLine: "Приём заявок до 15 сентября 2026, 23:59 (сингапурское время, UTC+8).",
      dropSearchLabel: "ВАШ АДРЕС",
      dropSearchPh: "Вставьте 0x-адрес",
      dropListTitle: "СПИСОК",
      dropRulesTitle: "ПРАВИЛА",
      dropListNote: "100 адресов в колонке. Переключайте колонки для поиска.",
      dropColJump: "Колонка",
      dropColAddr: "АДРЕС",
      dropColAmt: "LIM",
      dropColOpt: "Колонка {n} · {from}–{to}",
      dropMissTitle: "НЕТ В СПИСКЕ?",
      dropMissHint: "Если вы отправили скриншот и адрес в Telegram или X, но вас нет в списке, пришлите кошелёк для ончейн-проверки.",
      dropMissNotePh: "Telegram / примечание (необязательно)",
      dropMissGo: "ОТПРАВИТЬ",
      dropMissOk: "Скопировано. Вставьте в группу Telegram.",
      dropMissBad: "Требуется полный 0x-адрес.",
      dropNotFound: "Этого адреса нет в списке. Если вы уже отправляли данные в Telegram или X, отправьте их со вкладки «Правила».",
      dropStatLim: "LIM",
      dropStatWallets: "АДРЕСА В СПИСКЕ",
      dropStatChain: "ОНЧЕЙН-ЗАЧИСЛЕНИЕ",
      ruleOriginTitle: "Право на получение",
      ruleOriginBody: "Этот раунд предназначен для участников, которые отправили скриншот и кошелёк в комментариях кампании в Telegram и X и после проверки внесены в список. В списке более 3 000 адресов. Получить могут только адреса из списка; это не открытая раздача.",
      ruleClaimTitle: "Как получить",
      ruleClaimBody: "Подтвердите адрес и сумму на этой странице, затем откройте Catbox и подключите тот же кошелёк. LIM зачисляется ончейн на этот адрес без промежуточного счёта.",
      ruleDeadlineTitle: "Срок",
      ruleDeadlineBody: "Получение необходимо завершить до 15 сентября 2026, 23:59 (сингапурское время, UTC+8). Невостребованные суммы после этого срока перераспределяются по правилам ниже.",
      ruleAfterTitle: "После срока",
      ruleAfterBody: "Невостребованный LIM не изымается. 50% повторно аирдропится адресам, которые не получили средства; 50% направляется в призовые пулы Catbox: дневной рейтинг, рейтинг приглашений и другие мини-игры.",
      ruleAmtTitle: "Правила распределения",
      ruleAmtBody: "Всего 100 000 LIM. Места дневного рейтинга 1–10: по 100 LIM; места 11–40: по 50 LIM. Остальные адреса списка делят остаток поровну, около {share} LIM.",
      tgTitle: "TELEGRAM",
      tgBtn: "ВСТУПИТЬ В ГРУППУ",
      tgBody: "Напоминания о получении и последующие уведомления публикуются в группе.",
      privacyTitle: "ПРИВАТНЫЙ ПЕРЕВОД",
      privacyBtn: "ПУТЬ НЕ ОТОБРАЖАЕТСЯ",
      privacyBody: "Путь перевода LIM по умолчанию не отображается.",
      catboxTitle: "CATBOX",
      catboxBtn: "АНОНИМНАЯ РАЗДАЧА",
      catboxBody: "Ончейн-получение на ваш кошелёк. Без кастодиального счёта.",
    },
  };

  const $ = (id) => document.getElementById(id);
  let lang = detectLang();
  if (!I18N[lang]) lang = "en";
  let rows = [];
  let filtered = [];
  let col = 0;
  let highlight = "";
  let shareWei = 0n;

  function detectLang() {
    try {
      if (localStorage.getItem("catbox-lang-on") === "1") {
        const saved = localStorage.getItem("catbox-lang");
        if (saved && I18N[saved]) return saved;
      }
    } catch (_) {}
    let nav = "";
    try {
      nav = `${navigator.language || ""} ${(navigator.languages || []).join(" ")}`.toLowerCase();
    } catch (_) {}
    if (/zh/.test(nav)) return "zh";
    if (/\bja\b/.test(nav)) return "ja";
    if (/\bko\b/.test(nav)) return "ko";
    if (/\bvi\b/.test(nav)) return "vi";
    if (/\bid\b|indonesian/.test(nav)) return "id";
    if (/\bfil\b|\btl\b|filipino|tagalog/.test(nav)) return "fil";
    if (/\bth\b/.test(nav)) return "th";
    if (/\bru\b/.test(nav)) return "ru";
    return "en";
  }

  function t(key, vars) {
    const pack = I18N[lang] || I18N.en;
    let s = pack[key] ?? I18N.en[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        s = s.replaceAll(`{${k}}`, String(v));
      });
    }
    return s;
  }

  function applyI18n() {
    document.documentElement.lang = HTML_LANG[lang] || lang;
    document.body.dataset.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.id === "ruleAmt") return;
      el.innerHTML = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    const now = $("langNow");
    const cur = LANGS.find((l) => l.id === lang) || LANGS[0];
    if (now) now.textContent = cur.label;
    document.querySelectorAll("#langs .lang-btn").forEach((b) => {
      b.classList.toggle("on", b.dataset.lang === lang);
    });
    paintRuleAmt();
    if (rows.length) {
      paintJump();
      paintList();
      const q = ($("dropQ")?.value || "").trim().toLowerCase();
      const exact = q.length >= 40 ? rows.find(([a]) => a.toLowerCase() === q) : null;
      paintHit(q, exact);
    }
  }

  function paintRuleAmt() {
    const el = $("ruleAmt");
    if (!el) return;
    el.textContent = t("ruleAmtBody", { share: fmtLim(shareWei || "26487367563162184189") });
  }

  function fmtLim(wei) {
    const n = Number(wei) / 1e18;
    return n.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 0 });
  }

  function colCount() {
    return Math.max(1, Math.ceil(filtered.length / COL));
  }

  function paintJump() {
    const sel = $("colJump");
    if (!sel) return;
    const n = colCount();
    const keep = Math.min(col, n - 1);
    col = keep < 0 ? 0 : keep;
    const html = [];
    for (let i = 0; i < n; i++) {
      const from = i * COL + 1;
      const to = Math.min(filtered.length, (i + 1) * COL);
      html.push(`<option value="${i}">${t("dropColOpt", { n: i + 1, from, to })}</option>`);
    }
    sel.innerHTML = html.join("");
    sel.value = String(col);
    const prev = $("colPrev");
    const next = $("colNext");
    if (prev) prev.disabled = col <= 0;
    if (next) next.disabled = col >= n - 1;
  }

  function rowHtml([a, n], i) {
    const on = highlight && a.toLowerCase() === highlight ? " on" : "";
    return `<li class="${on.trim()}"><span class="i">${i}</span><span class="a" title="${a}">${a}</span><span class="n">${fmtLim(n)}</span></li>`;
  }

  function paintList() {
    const box = $("dropList");
    if (!box) return;
    const start = col * COL;
    const slice = filtered.slice(start, start + COL);
    const mid = Math.ceil(slice.length / 2) || 0;
    const left = slice.slice(0, mid);
    const right = slice.slice(mid);
    const leftOl = left
      .map((r, i) => rowHtml(r, start + i + 1))
      .join("");
    const rightOl = right
      .map((r, i) => rowHtml(r, start + mid + i + 1))
      .join("");
    box.innerHTML = `<ol>${leftOl}</ol><ol>${rightOl}</ol>`;
    const prev = $("colPrev");
    const next = $("colNext");
    if (prev) prev.disabled = col <= 0;
    if (next) next.disabled = col >= colCount() - 1;
  }

  function setCol(i) {
    const n = colCount();
    col = Math.max(0, Math.min(n - 1, i));
    const sel = $("colJump");
    if (sel) sel.value = String(col);
    paintJump();
    paintList();
  }

  function applyFilter() {
    const q = ($("dropQ")?.value || "").trim().toLowerCase();
    if (!q) {
      filtered = rows;
      highlight = "";
    } else {
      filtered = rows.filter(([a]) => a.toLowerCase().includes(q));
    }
    const exact = q.length >= 40 ? rows.find(([a]) => a.toLowerCase() === q) : null;
    highlight = exact ? exact[0].toLowerCase() : "";
    if (exact) {
      const idx = filtered.findIndex(([a]) => a.toLowerCase() === exact[0].toLowerCase());
      col = idx >= 0 ? Math.floor(idx / COL) : 0;
    } else {
      col = 0;
    }
    paintJump();
    paintList();
    paintHit(q, exact);
  }

  function paintHit(q, exact) {
    const box = $("dropHit");
    if (!box) return;
    if (!q || q.length < 6) {
      box.className = "hit hidden";
      box.innerHTML = "";
      return;
    }
    const one = exact || (filtered.length === 1 ? filtered[0] : null);
    if (one) {
      box.className = "hit";
      box.innerHTML = `<div class="addr">${one[0]}</div><div class="amt">${fmtLim(one[1])} LIM</div><a class="btn-claim" href="${CATBOX}" target="_blank" rel="noopener noreferrer">${t("dropCta")}</a>`;
      return;
    }
    if (q.startsWith("0x") && q.length >= 40 && filtered.length === 0) {
      box.className = "hit miss";
      box.innerHTML = `<div class="addr">${q}</div><p>${t("dropNotFound")}</p>`;
      return;
    }
    box.className = "hit hidden";
    box.innerHTML = "";
  }

  function setPane(id) {
    const list = id === "list";
    $("tabList")?.classList.toggle("on", list);
    $("tabRules")?.classList.toggle("on", !list);
    $("tabList")?.setAttribute("aria-selected", String(list));
    $("tabRules")?.setAttribute("aria-selected", String(!list));
    $("paneList")?.classList.toggle("on", list);
    $("paneRules")?.classList.toggle("on", !list);
    if ($("paneList")) $("paneList").hidden = !list;
    if ($("paneRules")) $("paneRules").hidden = list;
  }

  function mountLangs() {
    const nav = $("langs");
    const now = $("langNow");
    if (!nav) return;
    nav.innerHTML = LANGS.map(
      (l) => `<button type="button" class="lang-btn${l.id === lang ? " on" : ""}" data-lang="${l.id}">${l.label}</button>`,
    ).join("");
    if (now) {
      now.onclick = (e) => {
        e.stopPropagation();
        nav.classList.toggle("hidden");
      };
    }
    nav.onclick = (e) => {
      e.stopPropagation();
      const btn = e.target.closest("[data-lang]");
      if (!btn) return;
      lang = btn.dataset.lang;
      try {
        localStorage.setItem("catbox-lang", lang);
        localStorage.setItem("catbox-lang-on", "1");
      } catch (_) {}
      nav.classList.add("hidden");
      applyI18n();
    };
    document.addEventListener("click", () => nav.classList.add("hidden"));
  }

  async function load() {
    const embedded = document.getElementById("airdropListData");
    const data = embedded?.textContent?.trim()
      ? JSON.parse(embedded.textContent)
      : await fetch("./airdrop-list.json").then((r) => r.json());
    rows = data.rows || [];
    filtered = rows;
    shareWei = BigInt(data.shareWei || "0");
    if ($("dropCount")) $("dropCount").textContent = Number(data.count || rows.length).toLocaleString();
    if ($("dropTotal")) $("dropTotal").textContent = "100,000";
    paintRuleAmt();
    paintJump();
    paintList();
  }

  $("dropQ")?.addEventListener("input", applyFilter);
  $("colPrev")?.addEventListener("click", () => setCol(col - 1));
  $("colNext")?.addEventListener("click", () => setCol(col + 1));
  $("colJump")?.addEventListener("change", (e) => setCol(Number(e.target.value) || 0));
  $("tabList")?.addEventListener("click", () => setPane("list"));
  $("tabRules")?.addEventListener("click", () => setPane("rules"));

  $("dropMissForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const addr = ($("missAddr")?.value || "").trim();
    const note = ($("missNote")?.value || "").trim();
    const status = $("missStatus");
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      if (status) status.textContent = t("dropMissBad");
      return;
    }
    const msg = `Catbox Dash airdrop miss\n${addr}${note ? "\n" + note : ""}`;
    try {
      await navigator.clipboard.writeText(msg);
      if (status) status.textContent = t("dropMissOk");
    } catch (_) {
      if (status) status.textContent = msg;
    }
    window.open(TG, "_blank", "noopener,noreferrer");
  });

  mountLangs();
  applyI18n();
  load().catch(() => {
    const box = $("dropList");
    if (box) box.innerHTML = "<ol><li>list failed</li></ol>";
  });
})();
