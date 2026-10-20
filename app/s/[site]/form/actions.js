'use server';

import { contentAction, str, go } from '@/lib/content';

const STATUS = ['new', 'read', 'done', 'spam'];

export async function updateSubmission(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const patch = { note: str(fd, 'note', 2000) };
  if (STATUS.includes(fd.get('status'))) patch.status = fd.get('status');
  await supabase.from('form_submissions').update(patch).eq('id', id).eq('site_id', site.id);
  go(`/s/${slug}/form/${id}`, 'Disimpan.');
}

export async function deleteSubmission(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('form_submissions').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  go(`/s/${slug}/form`, 'Kiriman dihapus.');
}

// Penerima email notifikasi (owner/admin). Kosong = email owner.
export async function saveRecipients(fd) {
  const { site, slug, supabase } = await contentAction(fd, ['owner', 'admin']);
  const emails = [...new Set(str(fd, 'recipients', 1000).split(/[\s,;]+/).map((e) => e.toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 10);
  const { data: s } = await supabase.from('sites').select('settings').eq('id', site.id).single();
  const { error } = await supabase.from('sites').update({ settings: { ...s.settings, form_recipients: emails } }).eq('id', site.id);
  go(`/s/${slug}/form`, error ? error.message : 'Penerima notifikasi disimpan.');
}
