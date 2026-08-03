"use client";

import { useUI } from "@/lib/store";
import { Drawer, DrawerBody, DrawerHead } from "@/components/ui";
import { BlockRenderer } from "./BlockRenderer";

/**
 * The "View All" drawer, mounted once in the shell.
 *
 * Quick View shows a RECORD of a known entity. This shows BLOCKS — the list
 * of addresses, contacts or bank accounts that Overview deliberately keeps
 * off the page. It has no idea what it is rendering, which is what lets any
 * master reuse it by calling `ctx.panel({ title, blocks })`.
 */
export function PanelHost() {
  const opts = useUI((s) => s.panelOpts);
  const close = useUI((s) => s.closePanel);

  return (
    <Drawer open={Boolean(opts)} onClose={close} label={opts?.title ?? "Panel"}>
      {opts && (
        <>
          <DrawerHead
            title={
              <span className="flex flex-col">
                <span>{opts.title}</span>
                {opts.subtitle && (
                  <span className="text-cap font-normal text-ink-2">{opts.subtitle}</span>
                )}
              </span>
            }
            onClose={close}
          />
          <DrawerBody>
            <BlockRenderer blocks={opts.blocks} scale="drawer" />
          </DrawerBody>
        </>
      )}
    </Drawer>
  );
}
