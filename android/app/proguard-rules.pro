# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep SSH/SFTP classes
-keep class com.jcraft.jsch.** { *; }
-keep class org.apache.sshd.** { *; }

# Keep FreeRDP classes
-keep class com.freerdp.** { *; }

# Keep Terminal Emulator classes
-keep class com.termux.** { *; }

# Keep AWS SDK classes
-keep class com.amazonaws.** { *; }
-dontwarn com.amazonaws.**

# Keep Azure SDK classes
-keep class com.azure.** { *; }
-dontwarn com.azure.**

# Keep Google Cloud classes
-keep class com.google.cloud.** { *; }
-dontwarn com.google.cloud.**

# Keep VMware classes
-keep class com.vmware.** { *; }
-dontwarn com.vmware.**

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**

# Moshi
-keepclasseswithmembers class * {
    @com.squareup.moshi.* <methods>;
}
-keep @com.squareup.moshi.JsonQualifier interface *

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Keep data classes
-keep class com.connectty.android.data.** { *; }
-keep class com.connectty.android.domain.** { *; }
