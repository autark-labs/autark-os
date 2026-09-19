package com.autarkos.marketplace.install;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

class AppAccessCheckerTests {
    @Test
    void localProbeDoesNotSendAnHttp2UpgradeToAnHttp1AppServer() throws Exception {
        var upgrade = new AtomicReference<String>();
        var method = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            upgrade.set(exchange.getRequestHeaders().getFirst("Upgrade"));
            method.set(exchange.getRequestMethod());
            // Homepage closes cleartext upgrade requests instead of serving them.
            if (upgrade.get() == null) exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            var result = new AppAccessChecker().localHealthCheck("homepage", null,
                    "http://127.0.0.1:" + server.getAddress().getPort());
            assertThat(result.status()).isEqualTo("reachable");
            assertThat(upgrade.get()).isNull();
            assertThat(method.get()).isEqualTo("HEAD");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void serverErrorsRemainUnreachable() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();
        try {
            assertThat(new AppAccessChecker().localHealthCheck("homepage", null,
                    "http://127.0.0.1:" + server.getAddress().getPort()).status()).isEqualTo("unreachable");
        } finally {
            server.stop(0);
        }
    }
}
