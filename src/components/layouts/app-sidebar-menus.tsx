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
import {
  User,
  Settings,
  Building2,
  Users,
  CreditCard,
  Hammer,
  Wrench,
  Calculator,
} from "lucide-react";
import { BasicUser } from "app-types/user";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";

export function AppSidebarMenus({}: { user?: BasicUser }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [appStoreMutate] = appStore(useShallow((state) => [state.mutate]));

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {/* New Estimate Button */}
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
                <SidebarMenuButton className="flex font-semibold group/new-chat bg-gradient-to-r from-yellow-500/20 to-yellow-400/20 border border-yellow-400/40 hover:from-yellow-500/30 hover:to-yellow-400/30">
                  <Calculator className="size-4 text-yellow-600" />
                  New Estimate
                  <div className="flex items-center gap-1 text-xs font-medium ml-auto opacity-0 group-hover/new-chat:opacity-100 transition-opacity">
                    {getShortcutKeyList(Shortcuts.openNewChat).map((key) => (
                      <span
                        key={key}
                        className="border w-5 h-5 flex items-center justify-center bg-yellow-100 text-yellow-600 rounded"
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

        {/* Vendor List Button */}
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="font-semibold hover:bg-yellow-50 hover:text-yellow-700 transition-colors"
                onClick={() => {
                  // TODO: Implement vendor list functionality
                  console.log("Vendor List clicked");
                }}
              >
                <Building2 className="size-4 text-yellow-600" />
                Vendor List
              </SidebarMenuButton>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>

        {/* Labor List Button */}
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="font-semibold hover:bg-yellow-50 hover:text-yellow-700 transition-colors"
                onClick={() => {
                  // TODO: Implement labor list functionality
                  console.log("Labor List clicked");
                }}
              >
                <Users className="size-4 text-yellow-600" />
                Labor List
              </SidebarMenuButton>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>

        {/* Account & Billing Button */}
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="font-semibold hover:bg-yellow-50 hover:text-yellow-700 transition-colors"
                onClick={() => appStoreMutate({ openUserSettings: true })}
              >
                <CreditCard className="size-4 text-yellow-600" />
                Account & Billing
              </SidebarMenuButton>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
