package com.projectos.network.tailscale;

import java.util.List;

public record TailscaleConnectGuide(
        String headline,
        String summary,
        List<String> steps,
        String installUrl,
        String connectCommand,
        String advancedNote) {

    public static TailscaleConnectGuide defaults() {
        return new TailscaleConnectGuide(
                "Connect Project OS to Tailscale",
                "Start by adding this device to your tailnet. After that, Project OS can help publish private app links.",
                List.of(
                        "Create or sign in to a Tailscale account.",
                        "Install Tailscale on the Project OS host if it is not installed yet.",
                        "Run the connect command on this host and approve the login in your browser.",
                        "Return here once Project OS shows as connected."),
                "https://tailscale.com/download",
                "tailscale up",
                "Advanced users can later switch to reusable auth keys or OAuth-created keys for unattended setup.");
    }
}
