import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Redirect /payroll to /bookkeeping?tab=payroll for deep-link compatibility
const Payroll = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/bookkeeping?tab=payroll", { replace: true });
  }, [navigate]);

  return null;
};

export default Payroll;
