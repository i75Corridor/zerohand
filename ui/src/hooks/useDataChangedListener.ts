import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "../lib/ws.ts";
import type { WsMessage } from "@zerohand/shared";

/** Listens for data_changed WS events and invalidates React Query caches. */
export function useDataChangedListener() {
  const queryClient = useQueryClient();

  useWebSocket((msg: WsMessage) => {
    if (msg.type !== "data_changed") return;

    switch (msg.entity) {
      case "pipeline":
        queryClient.invalidateQueries({ queryKey: ["pipelines"] });
        queryClient.invalidateQueries({ queryKey: ["pipeline"] });
        break;
      case "step":
        queryClient.invalidateQueries({ queryKey: ["pipeline"] });
        break;
      case "skill":
        queryClient.invalidateQueries({ queryKey: ["skills"] });
        queryClient.invalidateQueries({ queryKey: ["skill"] });
        break;
    }
  });
}
