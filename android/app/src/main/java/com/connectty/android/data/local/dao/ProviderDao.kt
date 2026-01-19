package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.ProviderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProviderDao {
    @Query("SELECT * FROM providers ORDER BY name ASC")
    fun getAllProviders(): Flow<List<ProviderEntity>>

    @Query("SELECT * FROM providers WHERE enabled = 1 ORDER BY name ASC")
    fun getEnabledProviders(): Flow<List<ProviderEntity>>

    @Query("SELECT * FROM providers WHERE id = :id")
    suspend fun getProviderById(id: String): ProviderEntity?

    @Query("SELECT * FROM providers WHERE type = :type ORDER BY name ASC")
    fun getProvidersByType(type: String): Flow<List<ProviderEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(provider: ProviderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(providers: List<ProviderEntity>)

    @Update
    suspend fun update(provider: ProviderEntity)

    @Delete
    suspend fun delete(provider: ProviderEntity)

    @Query("DELETE FROM providers WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("UPDATE providers SET last_discovery_at = :timestamp WHERE id = :id")
    suspend fun updateLastDiscoveryAt(id: String, timestamp: Long)
}
