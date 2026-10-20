// Kirim email lewat Resend (PRD §4.7). Tanpa RESEND_API_KEY: hanya dicatat ke log server (mode development).
export async function sendEmail({ to, subject, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email:log-saja] ke=${[].concat(to).join(',')} subjek="${subject}"\n${text}`);
    return { simulated: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Fauqa One Click <noreply@fau-qa.com>', to: [].concat(to), subject, text, reply_to: replyTo || undefined }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}
