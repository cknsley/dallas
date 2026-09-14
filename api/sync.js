import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Optionnel : un mot de passe pour protéger tes données
  const key = req.headers['x-sync-key'];
  if (process.env.SYNC_SECRET && key !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: 'Accès refusé. Clé incorrecte.' });
  }

  const STORE_KEY = 'resell_state_v1';

  if (req.method === 'GET') {
    try {
      const data = await kv.get(STORE_KEY);
      if (!data) return res.status(404).json({ error: 'Aucune donnée trouvée.' });
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      // Vercel KV limite la taille par clé à 1MB généralement, ce qui est très large 
      // pour du JSON (l'état de ton app reste léger car les images sont gérées à part).
      await kv.set(STORE_KEY, req.body);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
