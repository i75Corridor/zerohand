import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "../lib/ws.ts";
import type { WsMessage } from "@pawn/shared";

/** Listens for data_changed WS events and invalidates React Query caches. */
export function useDataChangedListener() {
  const queryClient = useQueryClient();

  useWebSocket((msg: WsMessage) => {
    if (msg.type !== "data_changed") return;

    switch (msg.entity) {
      case "pipeline":
        queryClient.invalidateQueries({ queryKey: ["pipelines"] });
        queryClient.invalidateQueries({ queryKey: ["pipeline"] });
        queryClient.invalidateQueries({ queryKey: ["validate-builder"] });
        break;
      case "step":
        queryClient.invalidateQueries({ queryKey: ["pipeline"] });
        queryClient.invalidateQueries({ queryKey: ["validate-builder"] });
        break;
      case "skill":
        queryClient.invalidateQueries({ queryKey: ["skills"] });
        queryClient.invalidateQueries({ queryKey: ["skill-bundle", msg.id] });
        queryClient.invalidateQueries({ queryKey: ["validate-builder"] });
        break;
      case "cost":
        queryClient.invalidateQueries({ queryKey: ["costBreakdown"] });
        break;
    }
  });
}
