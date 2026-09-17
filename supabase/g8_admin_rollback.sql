-- supabase/g8_admin_rollback.sql
-- Kịch bản Rollback G8: Gỡ bỏ bảng admin_audit_logs, admin_users và toàn bộ hàm RPC

-- 1. Xóa các hàm RPC giao dịch nguyên tử
drop function if exists public.admin_create_place_atomic(uuid, text, text, jsonb, text, text);
drop function if exists public.admin_update_place_atomic(uuid, text, text, bigint, jsonb, text, text);
drop function if exists public.admin_delete_place_atomic(uuid, text, text, bigint, boolean, text, text);
drop function if exists public.admin_update_comment_atomic(uuid, text, text, bigint, jsonb, text, text);
drop function if exists public.admin_delete_comment_atomic(uuid, text, text, bigint, text, text);
drop function if exists public.admin_update_report_atomic(uuid, text, text, uuid, text, text, text, text);

-- 2. Xóa bảng admin_audit_logs
drop table if exists public.admin_audit_logs cascade;

-- 3. Xóa bảng admin_users và trigger liên quan
drop trigger if exists trg_set_admin_users_updated_at on public.admin_users;
drop function if exists public.set_admin_users_updated_at();
drop table if exists public.admin_users cascade;
