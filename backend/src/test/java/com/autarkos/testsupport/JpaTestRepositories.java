package com.autarkos.testsupport;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.sql.DataSource;

import jakarta.persistence.EntityManagerFactory;

import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.PlatformTransactionManager;

import com.autarkos.backups.BackupRepository;
import com.autarkos.database.AutarkOsDataSourceConfiguration;
import com.autarkos.database.AutarkOsDatabase;
import com.autarkos.discover.DiscoverSetupRepository;
import com.autarkos.host.ObservedServiceRepository;
import com.autarkos.jobs.AutarkOsJobRepository;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.devices.DeviceTrustRepository;
import com.autarkos.system.ProjectSettingsRepository;

public final class JpaTestRepositories {

    private static final Map<String, ConfigurableApplicationContext> CONTEXTS = new ConcurrentHashMap<>();

    private JpaTestRepositories() {
    }

    public static BackupRepository backupRepository(RuntimeLayout layout) {
        return context(layout).getBean(BackupRepository.class);
    }

    public static AutarkOsJobRepository jobRepository(RuntimeLayout layout) {
        return context(layout).getBean(AutarkOsJobRepository.class);
    }

    public static ProjectSettingsRepository projectSettingsRepository(RuntimeLayout layout) {
        return context(layout).getBean(ProjectSettingsRepository.class);
    }

    public static DeviceTrustRepository deviceTrustRepository(RuntimeLayout layout) {
        return context(layout).getBean(DeviceTrustRepository.class);
    }

    public static DiscoverSetupRepository discoverSetupRepository(RuntimeLayout layout) {
        return context(layout).getBean(DiscoverSetupRepository.class);
    }

    public static ObservedServiceRepository observedServiceRepository(RuntimeLayout layout) {
        return context(layout).getBean(ObservedServiceRepository.class);
    }

    private static ConfigurableApplicationContext context(RuntimeLayout layout) {
        String runtimeRoot = layout.runtimeRoot().toString();
        return CONTEXTS.computeIfAbsent(runtimeRoot, root -> new SpringApplicationBuilder(JpaRepositoryTestConfiguration.class)
                .web(WebApplicationType.NONE)
                .run("--autark-os.runtime-root=" + root));
    }

    @TestConfiguration
    @EnableJpaRepositories(basePackageClasses = {
            BackupRepository.class,
            AutarkOsJobRepository.class,
            ProjectSettingsRepository.class,
            DeviceTrustRepository.class,
            DiscoverSetupRepository.class,
            ObservedServiceRepository.class
    })
    @Import(AutarkOsDataSourceConfiguration.class)
    static class JpaRepositoryTestConfiguration {

        @Bean
        RuntimeLayout runtimeLayout(org.springframework.core.env.Environment environment) {
            AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
            properties.setRuntimeRoot(environment.getRequiredProperty("autark-os.runtime-root"));
            return new RuntimeLayout(properties);
        }

        @Bean
        AutarkOsDatabase autarkOsDatabase(RuntimeLayout runtimeLayout) {
            return new AutarkOsDatabase(runtimeLayout);
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean factory = new LocalContainerEntityManagerFactoryBean();
            factory.setDataSource(dataSource);
            factory.setPackagesToScan(
                    "com.autarkos.backups",
                    "com.autarkos.jobs",
                    "com.autarkos.system",
                    "com.autarkos.network.devices",
                    "com.autarkos.discover",
                    "com.autarkos.host");
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of(
                    "hibernate.hbm2ddl.auto", "none",
                    "hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect"));
            return factory;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory entityManagerFactory) {
            return new JpaTransactionManager(entityManagerFactory);
        }
    }
}
