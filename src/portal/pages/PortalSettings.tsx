import { Settings as SettingsIcon } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalSettings() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Profile & Settings" description="Manage your portal profile." />
      <PortalEmptyState
        icon={SettingsIcon}
        title="Settings Coming Soon"
        description="Profile and notification settings will be available once backend wiring is complete."
      />
    </div>
  );
}