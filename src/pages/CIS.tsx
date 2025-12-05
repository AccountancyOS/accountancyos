import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Redirect /cis to /bookkeeping?tab=cis for deep-link compatibility
const CIS = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/bookkeeping?tab=cis", { replace: true });
  }, [navigate]);

  return null;
};

export default CIS;
