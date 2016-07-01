--CREATE TYPE t AS (identificador text, lat numeric, lng numeric);
CREATE OR REPLACE FUNCTION auto_asignar(tienda_id integer, motorizado_json json) RETURNS text AS

$$
declare
	d numeric;
	result text;
begin
	d := (select last(distancia) from public.pedido_configuraciontiempo);
	result := (select
		motorizado.identifier
	from public.motorizado_motorizado as motorizado
	left join public.pedidos_motorizados as pedido on motorizado.empleado_id = pedido.motorizado_id
	join (select nombre, (latitud ||','|| longitud), (lat ||','|| lng), (degrees(ST_Distance(ST_GeomFromText('POINT('|| ti.latitud ||' '|| ti.longitud ||')'), ST_GeomFromText('POINT('|| n.lat ||' '|| n.lng ||')'))) * 2000), identificador from usuario_tienda as ti
		join (select * from json_populate_recordset(null::t, motorizado_json)) as n
			on (degrees(ST_Distance(ST_GeomFromText('POINT('|| ti.latitud ||' '|| ti.longitud ||')'), ST_GeomFromText('POINT('|| n.lat ||' '|| n.lng ||')'))) * 2000) < d
		where id=tienda_id) as distance on distance.identificador = motorizado.identifier
	group by motorizado.id
	order by last(pedido.creado) desc nulls first limit 1)::text;
	if result is null then
		return (select
			motorizado.identifier
		from public.motorizado_motorizado as motorizado
		join public.usuario_empleado as empleado on motorizado.empleado_id = empleado.usuario_ptr_id
		join public.usuario_tienda as tienda on tienda.empresa_id = empleado.empresa_id and tienda.id = tienda_id and empleado.ciudad_id = tienda.ciudad_id
		join (select * from json_populate_recordset(null::t, motorizado_json)) as n
			on motorizado.identifier = n.identificador
		order by (degrees(ST_Distance(ST_GeomFromText('POINT('|| tienda.latitud ||' '|| tienda.longitud ||')'), ST_GeomFromText('POINT('|| n.lat ||' '|| n.lng ||')'))) * 2000) asc
		limit 1)::text;
	end if;
	return result;
end;
$$
language plpgsql;

select auto_asignar(2, '[{"identificador":"2","lat": 10.390944, "lng": -75.478158},{"identificador":"1","lat": 10.391707, "lng": -75.479040}, {"identificador":"4","lat": 10.3790921, "lng": -75.4738238}]');
