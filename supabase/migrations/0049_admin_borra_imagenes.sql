-- 0049 · El administrador general puede borrar imágenes de cualquier usuario
--
-- Hasta ahora, en `logos` y `productos` solo el dueño de la carpeta podía
-- borrar sus archivos. Al borrar publicaciones desde el panel (o al limpiar
-- en "Datos" las imágenes que ya nadie usa), las fotos de otros quedaban en
-- el almacenamiento ocupando espacio, y la limpieza decía que las había
-- borrado sin poder hacerlo. En `banners` el admin ya podía (0012).

drop policy if exists "logos: admin borra" on storage.objects;
create policy "logos: admin borra"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'logos' and public.is_admin());

drop policy if exists "productos: admin borra" on storage.objects;
create policy "productos: admin borra"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos' and public.is_admin());
