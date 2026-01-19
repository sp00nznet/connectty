package com.connectty.android.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.connectty.android.data.local.dao.*
import com.connectty.android.data.local.entity.*

@Database(
    entities = [
        ConnectionEntity::class,
        CredentialEntity::class,
        ConnectionGroupEntity::class,
        ProviderEntity::class,
        DiscoveredHostEntity::class,
        SavedCommandEntity::class,
        CommandHistoryEntity::class,
        ProfileEntity::class,
        SessionStateEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class ConnecttyDatabase : RoomDatabase() {
    abstract fun connectionDao(): ConnectionDao
    abstract fun credentialDao(): CredentialDao
    abstract fun connectionGroupDao(): ConnectionGroupDao
    abstract fun providerDao(): ProviderDao
    abstract fun discoveredHostDao(): DiscoveredHostDao
    abstract fun savedCommandDao(): SavedCommandDao
    abstract fun commandHistoryDao(): CommandHistoryDao
    abstract fun profileDao(): ProfileDao
    abstract fun sessionStateDao(): SessionStateDao

    companion object {
        @Volatile
        private var INSTANCE: ConnecttyDatabase? = null

        fun getInstance(context: Context): ConnecttyDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    ConnecttyDatabase::class.java,
                    "connectty_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
