-- ============================================================================
-- ViVuTraVinh - Test Helper: Mô phỏng lỗi ghi audit log trong môi trường thử nghiệm
-- DÀNH RIÊNG CHO MÔI TRƯỜNG KIỂM THỬ: TẠO TRIGGER LỖI ĐỂ KIỂM ĐỊNH ROLLBACK NGUYÊN TỬ
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_test_audit_log_fail()
RETURNS TRIGGER AS $$
BEGIN
  -- Khi correlation_id bắt đầu bằng TEST_AUDIT_FAIL, cố tình ném exception
  -- để kiểm chứng việc PostgreSQL tự động rollback trạng thái entity trước đó
  IF NEW.correlation_id IS NOT NULL AND NEW.correlation_id LIKE 'TEST_AUDIT_FAIL%' THEN
    RAISE EXCEPTION 'TEST_INDUCED_AUDIT_LOG_FAILURE: Mô phỏng lỗi ghi nhật ký kiểm toán trong môi trường thử nghiệm'
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_test_audit_log_fail ON public.admin_audit_logs;
CREATE TRIGGER trg_test_audit_log_fail
  BEFORE INSERT ON public.admin_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_test_audit_log_fail();
