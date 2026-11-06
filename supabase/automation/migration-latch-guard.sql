-- Included by psql inside the same transaction and table lock as the update.
-- Refuse unexpected ownership, ACLs, hooks, inheritance and columns.
DO $guard$
DECLARE n pg_catalog.pg_namespace%ROWTYPE; t pg_catalog.pg_class%ROWTYPE; columns text; actor_oid oid;
BEGIN
  SELECT oid INTO actor_oid FROM pg_catalog.pg_roles WHERE rolname=current_user;
  SELECT * INTO n FROM pg_catalog.pg_namespace WHERE nspname='compor_migration_control';
  SELECT * INTO t FROM pg_catalog.pg_class WHERE relnamespace=n.oid AND relname='latch';
  IF n.oid IS NULL OR t.oid IS NULL OR n.nspowner <> actor_oid
     OR t.relowner <> actor_oid OR t.relkind <> 'r' OR t.relpersistence <> 'p' OR t.relispartition OR NOT t.relrowsecurity THEN
    RAISE EXCEPTION 'unexpected migration latch ownership or table';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE a.grantee <> n.nspowner)
     OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) a WHERE a.grantee <> t.relowner)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=t.oid)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite WHERE ev_class=t.oid)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=t.oid)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type ty ON ty.oid=a.atttypid
                WHERE a.attrelid=t.oid AND a.attnum>0 AND (a.attisdropped OR a.attacl IS NOT NULL OR a.attidentity<>'' OR a.attgenerated<>''
                  OR NOT a.attislocal OR a.attinhcount<>0 OR a.attcollation<>ty.typcollation
                  OR a.atttypid <> CASE a.attnum WHEN 1 THEN 'pg_catalog.bool'::regtype WHEN 2 THEN 'pg_catalog.text'::regtype
                    WHEN 3 THEN 'pg_catalog.timestamptz'::regtype ELSE 0 END))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=t.oid OR inhparent=t.oid) THEN
    RAISE EXCEPTION 'unexpected migration latch grants or dependencies';
  END IF;
  SELECT pg_catalog.string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod), ',' ORDER BY a.attnum)
    INTO columns FROM pg_catalog.pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped;
  IF (SELECT pg_catalog.array_agg(pg_catalog.pg_get_constraintdef(c.oid) ORDER BY pg_catalog.pg_get_constraintdef(c.oid))
      FROM pg_catalog.pg_constraint c WHERE c.conrelid=t.oid AND c.convalidated AND c.conislocal)
    IS DISTINCT FROM ARRAY[
      'CHECK (((run_token IS NULL) = (acquired_at IS NULL)))',
      $pattern$CHECK (((run_token IS NULL) OR (run_token ~ '^[0-9]+-[0-9]+$'::text)))$pattern$,
      'CHECK (singleton)',
      'PRIMARY KEY (singleton)']::text[]
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint WHERE conrelid=t.oid) <> 4
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attrdef WHERE adrelid=t.oid) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
                   WHERE d.adrelid=t.oid AND a.attname='singleton' AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='true')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped
               AND attnotnull <> (attname='singleton'))
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index WHERE indrelid=t.oid) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
                   JOIN pg_catalog.pg_am am ON am.oid=idx.relam
                   JOIN pg_catalog.pg_opclass opc ON opc.oid=i.indclass[0]
                   JOIN pg_catalog.pg_namespace ns ON ns.oid=opc.opcnamespace
                   WHERE i.indrelid=t.oid AND i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready
                     AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=1 AND i.indpred IS NULL AND i.indexprs IS NULL
                     AND i.indcollation[0]=0 AND am.amname='btree' AND ns.nspname='pg_catalog' AND opc.opcname='bool_ops')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_constraint c ON d.classid='pg_catalog.pg_constraint'::regclass AND d.objid=c.oid
               WHERE c.conrelid=t.oid AND (d.refclassid <> 'pg_catalog.pg_class'::regclass OR d.refobjid <> t.oid))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_attrdef a ON d.classid='pg_catalog.pg_attrdef'::regclass AND d.objid=a.oid
               WHERE a.adrelid=t.oid AND (d.refclassid <> 'pg_catalog.pg_class'::regclass OR d.refobjid <> t.oid)) THEN
    RAISE EXCEPTION 'unexpected migration latch constraints, indexes or defaults';
  END IF;
  IF columns <> 'singleton:boolean,run_token:text,acquired_at:timestamp with time zone'
     OR (SELECT pg_catalog.count(*) FROM compor_migration_control.latch) <> 1 THEN
    RAISE EXCEPTION 'unexpected migration latch columns or rows';
  END IF;
END
$guard$;
