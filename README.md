# ADO Command Center

Vanilla HTML, CSS ve JavaScript ile hazırlanmış kişisel, offline-first komuta merkezi.

## Yayınlama

Bu klasörü GitHub deposunun köküne aktarın, commit/push yapın ve **Settings → Pages → Deploy from a branch** altında ana dalın kökünü seçin.

## Gemini proxy

`worker/` klasöründe Cloudflare Worker örneği bulunur. `wrangler.toml.example` dosyasını `wrangler.toml` olarak kopyalayın, `ALLOWED_ORIGIN` değerini sitenize göre ayarlayın, sonra Cloudflare tarafında `GEMINI_API_KEY` secret'ını ekleyip Worker'ı deploy edin. Oluşan URL'yi uygulamada **Settings → Gemini proxy** alanına girin. Anahtar hiçbir zaman GitHub Pages koduna yazılmaz.

## Tarayıcı sınırları

Tarayıcı güvenliği nedeniyle yerel uygulama/işletim sistemi komutları çalıştırılamaz. Sistem bilgileri tarayıcının izin verdiği kadardır. QR aracı çevrimiçi servis kullanır; AI ve dış site kısayolları çevrimdışıyken çalışmaz. Diğer kayıt ve araçlar cihazda IndexedDB/localStorage kullanır.
