import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json' with { type: 'json' }

function momentumServiceWorker(): Plugin {
  return {
    name: 'momentum-service-worker',
    generateBundle(_: unknown, bundle: Record<string, unknown>) {
      const assets = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png', '/privacy.html', '/terms.html', '/support.html', ...Object.keys(bundle).map(file => `/${file}`)]
      const source = `const CACHE_NAME=${JSON.stringify(`momentum-shell-v${packageJson.version}`)}\nconst APP_SHELL=${JSON.stringify([...new Set(assets)])}\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL))))\nself.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())))\nself.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()})\nself.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put('/index.html',response.clone()));return response}).catch(()=>caches.match('/index.html')));return}event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));return response})))})\nself.addEventListener('push',event=>{let data={};try{data=event.data?.json()??{}}catch{data={body:event.data?.text()??''}}const title=typeof data.title==='string'?data.title:'Momentum';const options={body:typeof data.body==='string'?data.body:'Momentum hatırlatıcın hazır.',icon:'/icon-192.png',badge:'/icon-192.png',tag:typeof data.tag==='string'?data.tag:'momentum-reminder',data:{url:typeof data.url==='string'?data.url:'/'} };event.waitUntil(self.registration.showNotification(title,options))})\nself.addEventListener('notificationclick',event=>{event.notification.close();const target=new URL(event.notification.data?.url||'/',self.location.origin).href;event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{const existing=clients.find(client=>new URL(client.url).origin===self.location.origin);if(existing){existing.navigate?.(target);return existing.focus()}return self.clients.openWindow(target)}))})\n`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), momentumServiceWorker()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
})
