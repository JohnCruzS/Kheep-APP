-- ============================================================================
-- 0044 · Banners del admin con GIF y video
-- ============================================================================
-- Pedido del cliente: el admin puede subir banners animados (GIF) o en video
-- corto, sin sonido, que no pesen ni duren mucho. La app pone los límites
-- antes de subir:
--   - GIF: hasta 2 MB.
--   - Video (MP4): hasta 10 segundos y 4 MB. Se reproduce siempre sin sonido.
-- Acá se deja que el almacenamiento de banners acepte esos formatos, con el
-- mismo tope duro de siempre (5 MB por archivo): aunque alguien se saltara
-- la app, nada más pesado entra.
--
-- Para que no ocupen espacio de más, la app borra sola (con el archivo) los
-- banners GIF o video que ya vencieron, cada vez que un admin abre Banners.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

update storage.buckets
   set file_size_limit = 5242880, -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']
 where id = 'banners';
