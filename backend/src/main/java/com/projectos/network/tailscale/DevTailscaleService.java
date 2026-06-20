package com.projectos.network.tailscale;

import java.time.Instant;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("dev")
public class DevTailscaleService extends TailscaleService {

    private static final String DEV_DNS = "project-os-dev.tailnet.local";

    public DevTailscaleService() {
        super(command -> new CommandResult(0, List.of(), false));
    }

    @Override
    public TailscaleStatus status() {
        return new TailscaleStatus(
                true,
                true,
                "dev",
                "Dev mode is using a local Tailscale mock. No real Tailscale Serve changes will be made.",
                "project-os-dev",
                DEV_DNS,
                List.of("100.64.0.10"),
                "dev-tailnet",
                "dev@project-os.local");
    }

    @Override
    public TailscaleServeResult serveHttps(int localPort) {
        return serveHttps(localPort, localPort);
    }

    @Override
    public TailscaleServeResult serveHttps(int localPort, int httpsPort) {
        String privateUrl = httpsPort == 443 ? "https://" + DEV_DNS : "https://" + DEV_DNS + ":" + httpsPort;
        return new TailscaleServeResult(
                true,
                privateUrl,
                "Dev mode created a mock private HTTPS link. No Tailscale Serve command was run.",
                List.of("dev tailscale serve --https=" + httpsPort + " http://127.0.0.1:" + localPort));
    }

    @Override
    public TailscaleServeConfig serveConfig() {
        return new TailscaleServeConfig(
                true,
                "dev_mock",
                "Dev mode treats private links as verified without reading Tailscale Serve config.",
                List.of(),
                List.of("dev tailscale serve get-config --all"),
                Instant.now());
    }

    @Override
    public TailscaleServeResult disableHttps(int httpsPort) {
        String privateUrl = httpsPort == 443 ? "https://" + DEV_DNS : "https://" + DEV_DNS + ":" + httpsPort;
        return new TailscaleServeResult(
                true,
                privateUrl,
                "Dev mode removed a mock private HTTPS link. No Tailscale Serve command was run.",
                List.of("dev tailscale serve --https=" + httpsPort + " off"));
    }

    @Override
    public List<TailscaleDevice> devices() {
        return List.of(
                new TailscaleDevice("self", "Project OS Dev", DEV_DNS, List.of("100.64.0.10"), "linux", true, null, "direct", null, "127.0.0.1", false, true, "dev"),
                new TailscaleDevice("phone", "Dev Phone", "phone." + DEV_DNS, List.of("100.64.0.11"), "ios", true, null, "direct", null, "100.64.0.11", false, false, "dev"));
    }
}
