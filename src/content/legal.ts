import type { Locale } from "@/i18n/locales";

// The legal copy for /terms and /refunds, per locale. Kept as plain data
// (not in messages/*.json) because it's long prose that changes on its
// own schedule — a lawyer's redline shouldn't touch UI strings. {company},
// {email}, {address} are substituted by the page. `sq` is the binding
// version (docs/architecture.md: Albanian is the primary market); `en`
// is a courtesy translation, and the terms say so.
export const LEGAL_UPDATED = "2026-09-15";

type Section = { title: string; paragraphs: string[] };

export const terms: Record<Locale, Section[]> = {
  sq: [
    { title: "Kush jemi dhe çfarë mbulon ky dokument", paragraphs: [
      "SmartDepo është një shërbim softuerik në internet (SaaS) i ofruar nga {company}, {address} (\"ne\"). Ai u mundëson kompanive të digjitalizojnë hapësirën e tyre të magazinimit, të regjistrojnë materiale sipas lokacionit të saktë dhe t'i gjejnë ose lëvizin ato përmes telefonit.",
      "Këto kushte rregullojnë përdorimin e SmartDepo nga çdo organizatë që hap një llogari (\"Klienti\") dhe nga përdoruesit që Klienti fton. Duke hapur llogari ose duke pranuar një ftesë, i pranon këto kushte. Versioni në shqip është ai detyrues; përkthimi në anglisht ofrohet për lehtësi.",
    ]},
    { title: "Llogaria dhe përdoruesit", paragraphs: [
      "Llogaria hapet nga një person i autorizuar për të vepruar në emër të Klientit, me një adresë email të verifikuar. Klienti është përgjegjës për të gjithë përdoruesit që fton (administratorë, menaxherë, punëtorë), për ruajtjen e fjalëkalimeve dhe për çdo veprim të kryer nga llogaritë e tij.",
      "Çdo organizatë ka të drejtë për një periudhë prove; hapja e llogarive të shumëfishta për të shmangur këtë kufizim nuk lejohet dhe mund të çojë në mbylljen e tyre.",
    ]},
    { title: "Periudha e provës", paragraphs: [
      "Çdo organizatë e re merr 30 ditë provë falas, pa nevojë për të dhëna pagese. Prova fillon në momentin që email-i i administratorit verifikohet. Pas mbarimit të saj, llogaria kalon në gjendje vetëm-lexim: të dhënat ruhen dhe mund të shikohen, por nuk mund të bëhen ndryshime derisa të aktivizohet një plan.",
    ]},
    { title: "Planet, çmimet dhe pagesa", paragraphs: [
      "Planet dhe limitet e tyre (përdorues, objekte, vende magazinimi) janë të publikuara në faqen e çmimeve. Çmimet janë në euro (EUR) dhe përfshijnë të gjitha tarifat tona; TVSH-ja aplikohet aty ku e kërkon ligji dhe tregohet para pagesës.",
      "Shërbimi paguhet paraprakisht për periudha prej 1, 3 ose 12 muajsh. Pagesa kryhet përmes Paysera (kartë, e-banking, transfer bankar ose llogari Paysera) ose, me marrëveshje, me faturë dhe transfer bankar. Nuk ka rinovim automatik dhe nuk tërheqim asnjëherë para nga llogaria jote pa një pagesë të iniciuar nga ti.",
      "Pagesa e kryer para mbarimit të periudhës aktuale e zgjat atë; ndërrimi i planit fillon një periudhë të re nga dita e pagesës. Nuk mund të kalosh në një plan limitet e të cilit organizata jote tashmë i tejkalon.",
      "Kur periudha e paguar mbaron pa u rinovuar, llogaria kalon në vetëm-lexim, njësoj si pas provës. Të njoftojmë me email 7 ditë para mbarimit.",
    ]},
    { title: "Rimbursimi", paragraphs: [
      "Kushtet e kthimit përshkruhen në Politikën e Rimbursimit, që është pjesë e këtyre kushteve.",
    ]},
    { title: "Të dhënat e tua", paragraphs: [
      "Të dhënat që fut në SmartDepo (planimetria, artikujt, stoku, lëvizjet, përdoruesit) mbeten pronë e Klientit. Ne i përdorim vetëm për të ofruar shërbimin dhe nuk ia shesim apo ia japim palëve të treta, përveç nënkontraktorëve që e mundësojnë shërbimin (hosting, dërgim email-esh, procesim pagesash), të cilët veprojnë sipas udhëzimeve tona.",
      "Të dhënat ruhen sa kohë llogaria ekziston, përfshirë periudhat vetëm-lexim. Klienti mund të kërkojë eksportimin ose fshirjen e plotë të të dhënave duke na shkruar; fshirja kryhet brenda 30 ditësh. Ne nuk ruajmë asnjëherë të dhëna kartash apo instrumentesh pagese — ato trajtohen vetëm nga Paysera. Detajet janë në Politikën e Privatësisë, që është pjesë e këtyre kushteve.",
    ]},
    { title: "Përdorimi i lejuar", paragraphs: [
      "SmartDepo nuk mund të përdoret për veprimtari të paligjshme, për të ruajtur përmbajtje që shkel të drejtat e të tjerëve, apo për të ndërhyrë në funksionimin e shërbimit (p.sh. tentativa aksesi të paautorizuar, ngarkesë e qëllimshme). Mund të pezullojmë llogari që shkelin këto kushte, pasi t'ju kemi njoftuar aty ku është e mundur.",
    ]},
    { title: "Disponueshmëria dhe përgjegjësia", paragraphs: [
      "Synojmë disponueshmëri të vazhdueshme, por shërbimi ofrohet \"siç është\", pa garanci se do të jetë i pandërprerë ose pa gabime. Mund të ketë ndërprerje të shkurtra për mirëmbajtje, për të cilat përpiqemi të njoftojmë paraprakisht.",
      "Përgjegjësia jonë ndaj Klientit për çdo pretendim që lidhet me shërbimin kufizohet në shumën që Klienti ka paguar për 12 muajt e fundit. Nuk përgjigjemi për humbje indirekte, humbje fitimi apo humbje të dhënash që Klienti nuk i ka ruajtur/eksportuar, deri në masën që ligji e lejon.",
    ]},
    { title: "Ndryshimet e kushteve", paragraphs: [
      "Mund t'i përditësojmë këto kushte dhe çmimet. Për ndryshime thelbësore njoftojmë me email të paktën 30 ditë para hyrjes në fuqi; ndryshimet e çmimeve nuk prekin periudhat tashmë të paguara. Nëse nuk pajtohesh, mund ta mbyllësh llogarinë para datës së hyrjes në fuqi.",
    ]},
    { title: "Ligji dhe kontakti", paragraphs: [
      "Këto kushte rregullohen nga ligjet e Republikës së Kosovës. Çdo mosmarrëveshje përpiqemi ta zgjidhim me marrëveshje; në të kundërt, kompetente janë gjykatat e Prishtinës.",
      "Për çdo pyetje: {email}.",
    ]},
  ],
  en: [
    { title: "Who we are and what this covers", paragraphs: [
      "SmartDepo is an online software service (SaaS) provided by {company}, {address} (\"we\"). It lets companies digitize their storage space, register materials against exact locations, and find or move them from a phone.",
      "These terms govern the use of SmartDepo by any organization that opens an account (the \"Customer\") and by the users the Customer invites. By opening an account or accepting an invite you agree to them. The Albanian version is the binding one; this English text is a courtesy translation.",
    ]},
    { title: "Account and users", paragraphs: [
      "An account is opened by a person authorized to act for the Customer, with a verified email address. The Customer is responsible for every user it invites (admins, managers, workers), for keeping passwords safe, and for all activity under its accounts.",
      "Each organization is entitled to one trial; opening multiple accounts to get around that is not allowed and may lead to their closure.",
    ]},
    { title: "Free trial", paragraphs: [
      "Every new organization gets a 30-day free trial with no payment details required. The trial starts when the admin's email is verified. When it ends, the account becomes read-only: data is kept and can be viewed, but nothing can be changed until a plan is active.",
    ]},
    { title: "Plans, prices and payment", paragraphs: [
      "Plans and their limits (users, facilities, storage bins) are published on the pricing page. Prices are in euro (EUR) and include all of our fees; VAT is applied where the law requires it and shown before payment.",
      "The service is paid up front for periods of 1, 3 or 12 months, via Paysera (card, e-banking, bank transfer or Paysera account) or, by arrangement, by invoice and bank transfer. There is no automatic renewal and we never charge you without a payment you initiate.",
      "Paying before the current period ends extends it; changing plan starts a new period from the payment date. You cannot move to a plan whose limits your organization already exceeds.",
      "When a paid period ends without renewal the account becomes read-only, just as after the trial. We email you 7 days before it ends.",
    ]},
    { title: "Refunds", paragraphs: [
      "Refunds are described in the Refund Policy, which forms part of these terms.",
    ]},
    { title: "Your data", paragraphs: [
      "The data you put into SmartDepo (floor plans, items, stock, movements, users) stays the Customer's property. We use it only to provide the service and never sell or hand it to third parties, other than the subprocessors that run the service (hosting, email delivery, payment processing), who act on our instructions.",
      "Data is kept for as long as the account exists, including read-only periods. The Customer can request a full export or deletion by writing to us; deletion is completed within 30 days. We never store card or payment-instrument data — Paysera handles that exclusively. Details are in the Privacy Policy, which forms part of these terms.",
    ]},
    { title: "Acceptable use", paragraphs: [
      "SmartDepo may not be used for unlawful activity, to store content that infringes others' rights, or to interfere with the service (e.g. unauthorized access attempts, deliberate load). We may suspend accounts that breach these terms, after notifying you where possible.",
    ]},
    { title: "Availability and liability", paragraphs: [
      "We aim for continuous availability, but the service is provided \"as is\" without a guarantee that it will be uninterrupted or error-free. Short maintenance windows may occur; we try to announce them in advance.",
      "Our liability to the Customer for any claim relating to the service is limited to the amount the Customer paid in the preceding 12 months. To the extent the law allows, we are not liable for indirect losses, lost profit, or loss of data the Customer has not backed up or exported.",
    ]},
    { title: "Changes to these terms", paragraphs: [
      "We may update these terms and our prices. For material changes we email at least 30 days before they take effect; price changes never affect periods already paid for. If you disagree, you can close your account before the effective date.",
    ]},
    { title: "Law and contact", paragraphs: [
      "These terms are governed by the laws of the Republic of Kosovo. We try to settle any dispute amicably; failing that, the courts of Prishtina have jurisdiction.",
      "Questions: {email}.",
    ]},
  ],
};

export const refunds: Record<Locale, Section[]> = {
  sq: [
    { title: "Prova falas", paragraphs: [
      "30 ditët e para janë falas dhe pa të dhëna pagese, kështu që mund ta provosh SmartDepo plotësisht para se të paguash asgjë.",
    ]},
    { title: "Kthim i plotë brenda 14 ditësh", paragraphs: [
      "Nëse brenda 14 ditësh nga një pagesë vendos që SmartDepo nuk është për ty, na shkruaj te {email} dhe kthejmë shumën e plotë të asaj pagese, pa pyetje. Llogaria kalon në vetëm-lexim sapo kthimi kryhet.",
      "Kjo vlen për çdo pagesë (jo vetëm të parën), përfshirë zgjatjet dhe ndërrimet e planit.",
    ]},
    { title: "Pas 14 ditësh", paragraphs: [
      "Pas 14 ditësh pagesa nuk kthehet, por qasja vazhdon deri në fund të periudhës së paguar. Meqë nuk ka rinovim automatik, thjesht mos paguaj përsëri kur periudha mbaron — nuk do të faturohesh kurrë pa veprimin tënd.",
      "Nëse për faj tonë shërbimi nuk ka qenë i disponueshëm për më shumë se 24 orë rresht brenda një periudhe të paguar, e zgjasim periudhën me ditët e humbura ose, sipas zgjedhjes tënde, kthejmë pjesën proporcionale.",
    ]},
    { title: "Si kryhet kthimi", paragraphs: [
      "Kthimi bëhet me të njëjtën metodë pagese (përmes Paysera ose transfer bankar) brenda 10 ditësh pune nga kërkesa. Komisionet e procesimit të pagesës i mbulojmë ne — merr saktësisht shumën që pagove.",
    ]},
    { title: "Pagesa të gabuara ose të dyfishta", paragraphs: [
      "Nëse ke paguar dy herë ose shumën e gabuar, na shkruaj me numrin e referencës nga Paysera dhe e rregullojmë menjëherë.",
    ]},
  ],
  en: [
    { title: "Free trial", paragraphs: [
      "The first 30 days are free and need no payment details, so you can fully try SmartDepo before paying anything.",
    ]},
    { title: "Full refund within 14 days", paragraphs: [
      "If within 14 days of a payment you decide SmartDepo isn't for you, email {email} and we refund that payment in full, no questions asked. The account becomes read-only once the refund is made.",
      "This applies to every payment (not just the first), including extensions and plan changes.",
    ]},
    { title: "After 14 days", paragraphs: [
      "After 14 days a payment is non-refundable, but access continues until the end of the paid period. Since there is no automatic renewal, simply don't pay again when the period ends — you are never charged without your own action.",
      "If, through our fault, the service was unavailable for more than 24 consecutive hours within a paid period, we extend the period by the days lost or, at your choice, refund the proportional part.",
    ]},
    { title: "How refunds are paid", paragraphs: [
      "Refunds go back by the same payment method (via Paysera or bank transfer) within 10 business days of your request. We absorb the payment-processing fees — you get back exactly what you paid.",
    ]},
    { title: "Wrong or duplicate payments", paragraphs: [
      "If you paid twice or the wrong amount, email us with the Paysera reference number and we fix it right away.",
    ]},
  ],
};

export const privacy: Record<Locale, Section[]> = {
  sq: [
    { title: "Kush e përpunon të dhënat", paragraphs: [
      "Kontrolluesi i të dhënave është {company}, {address} (\"ne\"). Kjo politikë shpjegon çfarë të dhënash mbledh SmartDepo, pse, ku ruhen dhe cilat janë të drejtat e tua. Zbatohet për çdo person që hap një llogari ose përdor SmartDepo si përdorues i ftuar nga një organizatë (Klienti).",
      "Për të dhënat që Klienti fut vetë në SmartDepo (planimetria, artikujt, stoku, lëvizjet, të dhënat e punonjësve të tij), Klienti është kontrolluesi dhe ne veprojmë si përpunues sipas udhëzimeve të tij.",
    ]},
    { title: "Çfarë të dhënash mbledhim", paragraphs: [
      "Të dhëna llogarie: emri, adresa e email-it dhe fjalëkalimi (i ruajtur vetëm si hash, asnjëherë në tekst të hapur), roli në organizatë, data e verifikimit të email-it dhe e krijimit të llogarisë.",
      "Të dhëna të organizatës: emri i kompanisë, objektet dhe planimetritë e tyre, artikujt, sasitë e stokut dhe historiku i lëvizjeve. Çdo lëvizje stoku regjistron cilin përdorues e kreu — kjo është pjesë e funksionit të produktit (gjurmueshmëria) dhe është e dukshme për organizatën.",
      "Të dhëna pagese: plani, periudha e blerë, shuma, data dhe numri i referencës nga Paysera. Nuk marrim dhe nuk ruajmë asnjëherë numra kartash apo të dhëna bankare — ato futen vetëm në faqen e Paysera-s.",
      "Të dhëna teknike: adresa IP, lloji i shfletuesit dhe koha e kërkesave, në log-et e serverit të ofruesit të hostimit, të ruajtura për një periudhë të shkurtër për siguri dhe diagnostikim. Nuk përdorim mjete analitike apo reklamuese të palëve të treta.",
    ]},
    { title: "Cookies", paragraphs: [
      "Përdorim vetëm cookies rreptësisht të nevojshme: sesioni i hyrjes (që të mbetesh i identifikuar), gjuha e zgjedhur dhe objekti (depoja) ku po punon. Asnjë cookie gjurmimi apo reklamimi. Prandaj nuk shfaqim banner pëlqimi për cookies.",
    ]},
    { title: "Pse i përpunojmë", paragraphs: [
      "Për të ofruar shërbimin që Klienti ka kontraktuar (ekzekutimi i kontratës): identifikimi, ruajtja dhe shfaqja e të dhënave të depos, pagesat.",
      "Për të dërguar email-e operacionale: verifikimi i adresës, ftesat në ekip, rivendosja e fjalëkalimit, njoftimi 7 ditë para mbarimit të provës ose të periudhës së paguar. Nuk dërgojmë email-e marketingu pa pëlqimin tënd.",
      "Për sigurinë dhe parandalimin e abuzimit (interes legjitim): p.sh. bllokimi i adresave të përkohshme të email-it dhe i llogarive të shumëfishta për të njëjtën provë falas.",
      "Për detyrime ligjore: ruajtja e të dhënave të faturimit sa kohë e kërkon ligji tatimor dhe i kontabilitetit.",
    ]},
    { title: "Kush i sheh të dhënat (nënpërpunuesit)", paragraphs: [
      "Nuk i shesim dhe nuk i ndajmë të dhënat me palë të treta për qëllimet e tyre. I përdorim këta ofrues, të cilët i përpunojnë vetëm sipas udhëzimeve tona: Vercel (hostimi i aplikacionit), Neon (baza e të dhënave, rajoni Frankfurt, BE), Resend (dërgimi i email-eve operacionale), Paysera (procesimi i pagesave — merr emrin, email-in dhe shumën e pagesës).",
      "Brenda organizatës tënde, administratorët dhe menaxherët shohin listën e anëtarëve (emër, email, rol) dhe historikun e lëvizjeve me emrin e personit që i ka kryer.",
    ]},
    { title: "Sa kohë i ruajmë", paragraphs: [
      "Sa kohë ekziston llogaria e organizatës, përfshirë periudhat vetëm-lexim pas mbarimit të provës ose të pagesës — asgjë nuk fshihet automatikisht, që një Klient që rinovon më vonë t'i gjejë të dhënat siç i la.",
      "Me kërkesë të Klientit fshijmë organizatën dhe të gjitha të dhënat e saj brenda 30 ditësh. Të dhënat e faturimit (pagesat) ruhen edhe pas kësaj vetëm sa e kërkon ligji. Log-et teknike fshihen automatikisht nga ofruesi i hostimit brenda pak javësh.",
    ]},
    { title: "Të drejtat e tua", paragraphs: [
      "Ke të drejtë të kërkosh qasje në të dhënat e tua, korrigjimin, fshirjen, kufizimin e përpunimit, transferimin (eksport të plotë të të dhënave të organizatës në format të lexueshëm nga makina) dhe të kundërshtosh përpunimin që bazohet në interes legjitim. Për të dhënat e organizatës, kërkesa duhet të vijë nga një administrator i saj.",
      "Na shkruaj te {email}; përgjigjemi brenda 30 ditësh. Nëse mendon se të dhënat e tua përpunohen në kundërshtim me ligjin, ke të drejtë të ankohesh te Agjencia për Informim dhe Privatësi e Republikës së Kosovës.",
    ]},
    { title: "Siguria", paragraphs: [
      "I gjithë trafiku është i enkriptuar (TLS). Fjalëkalimet ruhen si hash (bcrypt). Qasja në të dhënat e organizatës kufizohet sipas rolit (administrator, menaxher, punëtor). Të dhënat e pagesës nuk kalojnë kurrë nëpër serverët tanë. Nëse ndodh një shkelje sigurie që prek të dhënat e tua, të njoftojmë pa vonesë të panevojshme.",
    ]},
    { title: "Fëmijët", paragraphs: [
      "SmartDepo është shërbim për biznese dhe nuk u drejtohet personave nën 18 vjeç.",
    ]},
    { title: "Ndryshimet dhe kontakti", paragraphs: [
      "Nëse ndryshojmë këtë politikë në mënyrë thelbësore, njoftojmë administratorët me email të paktën 30 ditë përpara. Baza ligjore: Ligji nr. 06/L-082 për Mbrojtjen e të Dhënave Personale i Republikës së Kosovës dhe, ku zbatohet, GDPR.",
      "Pyetje për privatësinë: {email}.",
    ]},
  ],
  en: [
    { title: "Who processes your data", paragraphs: [
      "The data controller is {company}, {address} (\"we\"). This policy explains what data SmartDepo collects, why, where it is stored, and what your rights are. It applies to anyone who opens an account or uses SmartDepo as a user invited by an organization (the Customer).",
      "For data the Customer puts into SmartDepo itself (floor plans, items, stock, movements, its employees' details), the Customer is the controller and we act as a processor on its instructions.",
    ]},
    { title: "What we collect", paragraphs: [
      "Account data: name, email address and password (stored only as a hash, never in clear text), role in the organization, email-verification and account-creation dates.",
      "Organization data: company name, facilities and their floor plans, items, stock quantities and movement history. Every stock movement records which user performed it — that is part of the product (traceability) and is visible to the organization.",
      "Payment data: plan, period bought, amount, date and Paysera's reference number. We never receive or store card numbers or bank details — those are entered only on Paysera's page.",
      "Technical data: IP address, browser type and request times, in the hosting provider's server logs, kept briefly for security and diagnostics. We use no third-party analytics or advertising tools.",
    ]},
    { title: "Cookies", paragraphs: [
      "We use only strictly necessary cookies: the login session (so you stay signed in), your chosen language, and the facility you are working in. No tracking or advertising cookies — which is why there is no cookie consent banner.",
    ]},
    { title: "Why we process it", paragraphs: [
      "To provide the service the Customer contracted (performance of a contract): sign-in, storing and displaying warehouse data, payments.",
      "To send operational email: address verification, team invites, password reset, and the notice 7 days before a trial or paid period ends. We send no marketing email without your consent.",
      "For security and abuse prevention (legitimate interest): e.g. blocking disposable email addresses and duplicate accounts for the same free trial.",
      "For legal obligations: keeping billing records for as long as tax and accounting law requires.",
    ]},
    { title: "Who sees it (subprocessors)", paragraphs: [
      "We do not sell or share data with third parties for their own purposes. We use these providers, who process it only on our instructions: Vercel (application hosting), Neon (database, Frankfurt region, EU), Resend (operational email), Paysera (payment processing — receives name, email and the payment amount).",
      "Within your organization, admins and managers see the member list (name, email, role) and the movement history with the name of the person who performed each movement.",
    ]},
    { title: "How long we keep it", paragraphs: [
      "For as long as the organization's account exists, including read-only periods after a trial or paid period ends — nothing is deleted automatically, so a Customer who renews later finds the data as they left it.",
      "On a Customer's request we delete the organization and all its data within 30 days. Billing records (payments) are kept beyond that only as long as the law requires. Technical logs are purged automatically by the hosting provider within weeks.",
    ]},
    { title: "Your rights", paragraphs: [
      "You can request access to your data, correction, deletion, restriction of processing, portability (a full machine-readable export of the organization's data), and object to processing based on legitimate interest. For organization data, the request must come from one of its admins.",
      "Email {email}; we answer within 30 days. If you believe your data is processed unlawfully you may complain to the Information and Privacy Agency of the Republic of Kosovo.",
    ]},
    { title: "Security", paragraphs: [
      "All traffic is encrypted (TLS). Passwords are stored hashed (bcrypt). Access to organization data is limited by role (admin, manager, worker). Payment data never passes through our servers. If a security breach affects your data, we notify you without undue delay.",
    ]},
    { title: "Children", paragraphs: [
      "SmartDepo is a business service and is not directed at anyone under 18.",
    ]},
    { title: "Changes and contact", paragraphs: [
      "If we change this policy materially we email admins at least 30 days in advance. Legal basis: Law No. 06/L-082 on Protection of Personal Data of the Republic of Kosovo and, where applicable, the GDPR.",
      "Privacy questions: {email}.",
    ]},
  ],
};
