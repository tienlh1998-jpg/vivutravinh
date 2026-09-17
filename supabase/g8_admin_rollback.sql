-- supabase/g8_admin_rollback.sql
-- Kịch bản Rollback G8: Gỡ bỏ bảng admin_audit_logs và admin_users nếu cần thiết

-- 1. Xóa bảng admin_audit_logs
drop table if exists public.admin_audit_logs cascade;

-- 2. Xóa bảng admin_users và trigger liên quan
drop trigger if exists trg_set_admin_users_updated_at on public.admin_users;
drop function if exists public.set_admin_users_updated_at();
drop table if exists public.admin_users cascade;
