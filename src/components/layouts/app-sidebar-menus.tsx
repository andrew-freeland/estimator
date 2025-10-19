"use client";
import { SidebarMenuButton, useSidebar } from "ui/sidebar";
import { Tooltip } from "ui/tooltip";
import { SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroupContent } from "ui/sidebar";

import { SidebarGroup } from "ui/sidebar";
import Link from "next/link";
import { getShortcutKeyList, Shortcuts } from "lib/keyboard-shortcuts";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { WriteIcon } from "ui/write-icon";
import { User, Settings } from "lucide-react";
import { BasicUser } from "app-types/user";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";

export function AppSidebarMenus({}: { user?: BasicUser }) {
  const router = useRouter();
  const t = useTranslations("");
  const { setOpenMobile } = useSidebar();
  const [appStoreMutate] = appStore(useShallow((state) => [state.mutate]));

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {/* Chat Button */}
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem className="mb-1">
              <Link
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  setOpenMobile(false);
                  router.push(`/`);
                  router.refresh();
                }}
              >
                <SidebarMenuButton className="flex font-semibold group/new-chat bg-input/20 border border-border/40">
                  <WriteIcon className="size-4" />
                  {t("Layout.newChat")}
                  <div className="flex items-center gap-1 text-xs font-medium ml-auto opacity-0 group-hover/new-chat:opacity-100 transition-opacity">
                    {getShortcutKeyList(Shortcuts.openNewChat).map((key) => (
                      <span
                        key={key}
                        className="border w-5 h-5 flex items-center justify-center bg-accent rounded"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>

        {/* Account & Billing Button */}
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="font-semibold"
                onClick={() => appStoreMutate({ openUserSettings: true })}
              >
                <User className="size-4" />
                Account & Billing
              </SidebarMenuButton>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>

        {/* System Prompts Button */}
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="font-semibold"
                onClick={() => appStoreMutate({ openChatPreferences: true })}
              >
                <Settings className="size-4" />
                System Prompts
              </SidebarMenuButton>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
