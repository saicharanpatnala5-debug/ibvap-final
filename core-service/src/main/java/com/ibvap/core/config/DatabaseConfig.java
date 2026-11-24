package com.ibvap.core.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.io.File;
import java.net.InetSocketAddress;
import java.net.Socket;

@Configuration
public class DatabaseConfig {
    private static final Logger log = LoggerFactory.getLogger(DatabaseConfig.class);

    public static volatile String ACTIVE_DATABASE_ENGINE = "PostgreSQL";
    public static volatile String ACTIVE_DATABASE_URL = "jdbc:postgresql://localhost:5432/ibvap";

    @Value("${spring.datasource.url:jdbc:postgresql://localhost:5432/ibvap}")
    private String configuredUrl;

    @Value("${spring.datasource.username:ibvap}")
    private String username;

    @Value("${spring.datasource.password:ibvap_secret}")
    private String password;

    @Bean
    @Primary
    public DataSource dataSource() {
        if (configuredUrl != null && configuredUrl.contains("h2:mem")) {
            // Unit test in-memory database
            ACTIVE_DATABASE_ENGINE = "H2_IN_MEMORY_TEST";
            ACTIVE_DATABASE_URL = configuredUrl;
            HikariConfig config = new HikariConfig();
            config.setJdbcUrl(configuredUrl);
            config.setDriverClassName("org.h2.Driver");
            config.setUsername(username != null ? username : "sa");
            config.setPassword(password != null ? password : "");
            return new HikariDataSource(config);
        }

        // Test if PostgreSQL server is reachable
        boolean isPgReachable = false;
        if (configuredUrl != null && configuredUrl.startsWith("jdbc:postgresql://")) {
            try {
                String clean = configuredUrl.replace("jdbc:postgresql://", "");
                int slashIdx = clean.indexOf("/");
                String hostPort = slashIdx > 0 ? clean.substring(0, slashIdx) : clean;
                String[] parts = hostPort.split(":");
                String host = parts[0];
                int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 5432;

                try (Socket socket = new Socket()) {
                    socket.connect(new InetSocketAddress(host, port), 1200);
                    isPgReachable = true;
                }
            } catch (Exception e) {
                isPgReachable = false;
            }
        }

        HikariConfig config = new HikariConfig();
        if (isPgReachable) {
            ACTIVE_DATABASE_ENGINE = "PostgreSQL";
            ACTIVE_DATABASE_URL = configuredUrl;
            log.info("[IBVAP Core] Connected to PostgreSQL at: {}", configuredUrl);
            config.setJdbcUrl(configuredUrl);
            config.setDriverClassName("org.postgresql.Driver");
            config.setUsername(username);
            config.setPassword(password);
            config.setMaximumPoolSize(10);
        } else {
            new File("./data").mkdirs();
            String fileH2 = "jdbc:h2:file:./data/ibvap;DB_CLOSE_DELAY=-1;AUTO_SERVER=TRUE;MODE=PostgreSQL";
            ACTIVE_DATABASE_ENGINE = "H2_FILE_FALLBACK";
            ACTIVE_DATABASE_URL = fileH2;
            log.warn("[IBVAP Core] PostgreSQL is unreachable on configured URL; operating with persistent local database at {}", fileH2);
            config.setJdbcUrl(fileH2);
            config.setDriverClassName("org.h2.Driver");
            config.setUsername("ibvap");
            config.setPassword("ibvap_secret");
            config.setMaximumPoolSize(5);
        }

        return new HikariDataSource(config);
    }
}
