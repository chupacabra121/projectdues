import { requireOnboardedUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { updateFinancials } from "@/app/actions/setup";
import AppNav from "@/components/AppNav";
import { inputCls, labelCls } from "@/components/AuthShell";

export default async function SettingsPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;

  return (
    <>
      <AppNav chapterName={user.chapter_name} />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-8">Settings</h1>

        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-5">Chapter Financials</h2>
          <form action={updateFinancials} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Active Members</label>
                <input
                  name="active_members" type="number" min={0} className={inputCls}
                  defaultValue={settings.active_members}
                />
              </div>
              <div>
                <label className={labelCls}>Collection Rate (%)</label>
                <input
                  name="collection_rate" type="number" min={0} max={100} className={inputCls}
                  defaultValue={Math.round(settings.collection_rate * 100)}
                />
              </div>
              <div>
                <label className={labelCls}>Active Member Dues ($)</label>
                <input
                  name="active_dues" type="number" min={0} step="0.01" className={inputCls}
                  defaultValue={settings.active_dues}
                />
              </div>
              <div>
                <label className={labelCls}>Pledge Dues ($)</label>
                <input
                  name="pledge_dues" type="number" min={0} step="0.01" className={inputCls}
                  defaultValue={settings.pledge_dues}
                />
              </div>
              <div>
                <label className={labelCls}>Starting Bank Balance ($)</label>
                <input
                  name="starting_balance" type="number" min={0} step="0.01" className={inputCls}
                  defaultValue={settings.starting_balance}
                />
              </div>
              <div>
                <label className={labelCls}>Dues Collected So Far ($)</label>
                <input
                  name="dues_collected" type="number" min={0} step="0.01" className={inputCls}
                  defaultValue={settings.dues_collected}
                />
              </div>
              <div>
                <label className={labelCls}>Reserve Target ($)</label>
                <input
                  name="reserve_target" type="number" min={0} step="0.01" className={inputCls}
                  defaultValue={settings.reserve_target}
                />
                <p className="text-xs text-gray-400 mt-1">
                  How much you want left in the bank at semester&apos;s end.
                </p>
              </div>
            </div>
            <button className="rounded-lg bg-indigo-600 text-white py-2.5 px-5 text-sm font-medium hover:bg-indigo-700">
              Save Changes
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
