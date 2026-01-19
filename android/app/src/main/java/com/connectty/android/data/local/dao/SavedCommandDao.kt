package com.connectty.android.data.local.dao

import androidx.room.*
import com.connectty.android.data.local.entity.SavedCommandEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SavedCommandDao {
    @Query("SELECT * FROM saved_commands ORDER BY name ASC")
    fun getAllCommands(): Flow<List<SavedCommandEntity>>

    @Query("SELECT * FROM saved_commands WHERE id = :id")
    suspend fun getCommandById(id: String): SavedCommandEntity?

    @Query("SELECT * FROM saved_commands WHERE category = :category ORDER BY name ASC")
    fun getCommandsByCategory(category: String): Flow<List<SavedCommandEntity>>

    @Query("SELECT * FROM saved_commands WHERE target_os = :targetOS OR target_os = 'all' ORDER BY name ASC")
    fun getCommandsByTargetOS(targetOS: String): Flow<List<SavedCommandEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(command: SavedCommandEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(commands: List<SavedCommandEntity>)

    @Update
    suspend fun update(command: SavedCommandEntity)

    @Delete
    suspend fun delete(command: SavedCommandEntity)

    @Query("DELETE FROM saved_commands WHERE id = :id")
    suspend fun deleteById(id: String)
}
