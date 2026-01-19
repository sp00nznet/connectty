package com.connectty.android.domain.model

data class SerialSettings(
    val device: String,  // COM1, /dev/ttyUSB0, etc.
    val baudRate: Int = 9600,
    val dataBits: Int = 8,
    val stopBits: Int = 1, // 1 or 2 (1.5 not supported on Android)
    val parity: SerialParity = SerialParity.NONE,
    val flowControl: SerialFlowControl = SerialFlowControl.NONE
)

enum class SerialParity {
    NONE,
    ODD,
    EVEN,
    MARK,
    SPACE;

    companion object {
        fun fromString(value: String): SerialParity {
            return when (value.lowercase()) {
                "none" -> NONE
                "odd" -> ODD
                "even" -> EVEN
                "mark" -> MARK
                "space" -> SPACE
                else -> NONE
            }
        }
    }
}

enum class SerialFlowControl {
    NONE,
    HARDWARE,
    SOFTWARE;

    companion object {
        fun fromString(value: String): SerialFlowControl {
            return when (value.lowercase()) {
                "none" -> NONE
                "hardware" -> HARDWARE
                "software" -> SOFTWARE
                else -> NONE
            }
        }
    }
}

object SerialBaudRates {
    val SUPPORTED = listOf(
        300, 1200, 2400, 4800, 9600, 19200, 38400,
        57600, 115200, 230400, 460800, 921600
    )
}
