package com.autarkos.database;

import java.sql.Connection;
import java.sql.SQLException;

public abstract class DatabaseBackedRepository {

    private final AutarkOsDatabase database;

    protected DatabaseBackedRepository(AutarkOsDatabase database) {
        this.database = database;
    }

    protected void migrate() {
        database.migrate();
    }

    protected Connection connection() throws SQLException {
        return database.connection();
    }
}
