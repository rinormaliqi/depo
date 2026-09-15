import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

// Paysera verifies ownership of the Checkout project's site by looking
// for a <meta> tag it hands out on the project page. The tag is
// `<meta name="<name>" content="<value>">`; both halves are env-driven so
// the value can be pasted into Render without a code change, and so the
// tag simply doesn't render in environments that aren't the verified one.
function payseraVerification(): Record<string, string> {
  const name = process.env.NEXT_PUBLIC_PAYSERA_VERIFICATION_NAME?.trim();
  const value = process.env.NEXT_PUBLIC_PAYSERA_VERIFICATION_VALUE?.trim();
  return name && value ? { [name]: value } : {};
}

export const metadata: Metadata = {
  title: "SmartDepo",
  description: "Digitize your storage. Find anything in seconds.",
  other: payseraVerification(),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
