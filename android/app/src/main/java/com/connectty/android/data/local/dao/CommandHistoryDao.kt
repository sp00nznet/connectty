package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.CommandHistoryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CommandHistoryDao {
    @Query("SELECT * FROM command_history ORDER BY started_at DESC")
    fun getAllHistory(): Flow<List<CommandHistoryEntity>>

    @Query("SELECT * FROM command_history WHERE id = :id")
    suspend fun getHistoryById(id: String): CommandHistoryEntity?

    @Query("SELECT * FROM command_history WHERE command_id = :commandId ORDER BY started_at DESC")
    fun getHistoryByCommandId(commandId: String): Flow<List<CommandHistoryEntity>>

    @Query("SELECT * FROM command_history ORDER BY started_at DESC LIMIT :limit")
    fun getRecentHistory(limit: Int = 50): Flow<List<CommandHistoryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(history: CommandHistoryEntity)

    @Update
    suspend fun update(history: CommandHistoryEntity)

    @Delete
    suspend fun delete(history: CommandHistoryEntity)

    @Query("DELETE FROM command_history WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM command_history")
    suspend fun deleteAll()
}
