// Данные каталога для корзины и поиска в браузере (генерируется при сборке).
import { clientData } from '../lib/catalog.js';

export function GET() {
  return new Response(JSON.stringify(clientData()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
