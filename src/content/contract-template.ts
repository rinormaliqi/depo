// The body of the 3-, 6- and 12-month contract PDF (src/lib/contract-pdf.ts), kept as
// plain data the same way src/content/legal.ts keeps the Terms — a
// generic template review shouldn't touch PDF-drawing code. `{token}`
// placeholders are substituted by the generator from the contract's
// stored clientInfo/pricingSnapshot and the company's own info. A
// paragraph marked `onlyWithDiscount` is dropped when the contract has no
// discount (3 and 6 months pay the full months × monthly price).
//
// This is a starting template, not reviewed by a lawyer — treat it as a
// draft to have checked before it's relied on for a real signature.
// `sq` is the version that matters (docs/architecture.md: Albanian is the
// primary market); `en` is a courtesy translation.

import type { Locale } from "@/i18n/locales";

export type ContractParagraph = string | { text: string; onlyWithDiscount: true };
export type ContractClause = { title: string; paragraphs: ContractParagraph[] };

export const CONTRACT_TEMPLATE: Record<Locale, ContractClause[]> = {
  sq: [
    {
      title: "1. Palët",
      paragraphs: [
        "Kjo kontratë lidhet mes {companyLegalName}, {companyAddress} (\"SmartDepo\"), dhe {clientLegalName}, {clientAddress}, nr. regjistrimi {clientRegistrationNumber} (\"Klienti\"), përfaqësuar nga {clientContactName}.",
      ],
    },
    {
      title: "2. Objekti i kontratës",
      paragraphs: [
        "SmartDepo i jep Klientit qasje në platformën SmartDepo, plani \"{planName}\", sipas kushteve të përgjithshme të shërbimit të publikuara në smartdepo.app/terms, të cilat konsiderohen pjesë përbërëse e kësaj kontrate.",
      ],
    },
    {
      title: "3. Kohëzgjatja",
      paragraphs: [
        "Kontrata mbulon një periudhë prej {months} muajsh, duke filluar nga data e aktivizimit të planit pas pranimit të pagesës sipas nenit 4.",
      ],
    },
    {
      title: "4. Çmimi dhe pagesa",
      paragraphs: [
        "Çmimi standard mujor i planit {planName} është {monthlyPrice}. Çmimi për {months} muaj është {standardTotal}.",
        {
          text: "Për këtë kontratë {months}-mujore, Klientit i aplikohet zbritje prej {discountMonths} muajsh falas (-{discountAmount}), duke e sjellë shumën totale për pagesë në {finalTotal}.",
          onlyWithDiscount: true,
        },
        "Pagesa kryhet me transfertë bankare në llogarinë e SmartDepo: {bankName}, IBAN {bankIban}{bankSwiftLine}, me referencë \"{clientLegalName}\".",
      ],
    },
    {
      title: "5. Detyrimet e palëve",
      paragraphs: [
        "SmartDepo mban platformën në funksion sipas kushteve të shërbimit dhe ofron mbështetje sipas kanaleve të publikuara.",
        "Klienti është përgjegjës për saktësinë e të dhënave që fut në platformë dhe për ruajtjen e kredencialeve të llogarisë.",
      ],
    },
    {
      title: "6. Zgjidhja e kontratës",
      paragraphs: [
        "Kjo kontratë zgjidhet automatikisht në përfundim të periudhës, përveç nëse rinovohet me marrëveshje të re. Rimbursimi rregullohet nga Politika e Rimbursimit e publikuar në smartdepo.app/refunds.",
      ],
    },
    {
      title: "7. E drejta e zbatueshme",
      paragraphs: ["Kjo kontratë rregullohet nga legjislacioni i Republikës së Kosovës."],
    },
  ],
  en: [
    {
      title: "1. Parties",
      paragraphs: [
        "This contract is entered into between {companyLegalName}, {companyAddress} (\"SmartDepo\"), and {clientLegalName}, {clientAddress}, registration no. {clientRegistrationNumber} (\"Customer\"), represented by {clientContactName}.",
      ],
    },
    {
      title: "2. Subject",
      paragraphs: [
        "SmartDepo grants the Customer access to the SmartDepo platform, \"{planName}\" plan, under the general terms of service published at smartdepo.app/terms, which form an integral part of this contract.",
      ],
    },
    {
      title: "3. Duration",
      paragraphs: ["This contract covers a period of {months} months, starting from the date the plan is activated after payment under Section 4."],
    },
    {
      title: "4. Price and payment",
      paragraphs: [
        "The standard monthly price of the {planName} plan is {monthlyPrice}. The price for {months} months is {standardTotal}.",
        {
          text: "For this {months}-month contract, the Customer receives a discount of {discountMonths} free months (-{discountAmount}), bringing the total amount due to {finalTotal}.",
          onlyWithDiscount: true,
        },
        "Payment is made by bank transfer to SmartDepo's account: {bankName}, IBAN {bankIban}{bankSwiftLine}, quoting \"{clientLegalName}\" as reference.",
      ],
    },
    {
      title: "5. Obligations of the parties",
      paragraphs: [
        "SmartDepo keeps the platform running under the terms of service and provides support through its published channels.",
        "The Customer is responsible for the accuracy of the data it enters into the platform and for keeping its account credentials safe.",
      ],
    },
    {
      title: "6. Termination",
      paragraphs: [
        "This contract ends automatically at the end of the period unless renewed by a new agreement. Refunds are governed by the Refund Policy published at smartdepo.app/refunds.",
      ],
    },
    {
      title: "7. Governing law",
      paragraphs: ["This contract is governed by the laws of the Republic of Kosovo."],
    },
  ],
};
