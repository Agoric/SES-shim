#ifndef __XSNAP__
#define __XSNAP__

#if defined(_MSC_VER)
	#if defined(_M_IX86) || defined(_M_X64)
		#undef mxLittleEndian
		#define mxLittleEndian 1
		#undef mxWindows
		#define mxWindows 1
		#define mxExport extern
		#define mxImport extern
		#define XS_FUNCTION_NORETURN
	#else
		#error unknown Microsoft compiler
	#endif
#elif defined(__GNUC__)
	#if defined(__i386__) || defined(i386) || defined(intel) || defined(arm) || defined(__arm__) || defined(__k8__) || defined(__x86_64__) || defined(__aarch64__)
		#undef mxLittleEndian
		#define mxLittleEndian 1
		#if defined(__linux__) || defined(linux)
			#undef mxLinux
			#define mxLinux 1
		#else
			#undef mxMacOSX
			#define mxMacOSX 1
		#endif
		#define mxExport extern
		#define mxImport extern
		#define XS_FUNCTION_NORETURN __attribute__((noreturn))
	#else
		#error unknown GNU compiler
	#endif
#else
	#error unknown compiler
#endif

#if mxWindows
	#define _USE_MATH_DEFINES
	#define WIN32_LEAN_AND_MEAN
	#define _WINSOCK_DEPRECATED_NO_WARNINGS
#endif
#include <ctype.h>
#include <float.h>
#include <math.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#if mxWindows
	#include <winsock2.h>
	typedef SOCKET txSocket;
	#define mxNoSocket INVALID_SOCKET
#else
	#include <fcntl.h>
	#include <arpa/inet.h>
	#include <netdb.h>
	#include <pthread.h>
	#include <signal.h>
	#include <unistd.h>
	typedef int txSocket;
	#define mxNoSocket -1
	#define mxUseGCCAtomics 1
	#define mxUsePOSIXThreads 1
#endif
#define mxMachinePlatform \
	txSocket connection; \
	int promiseJobs; \
	void* timerJobs; \
	void* waiterCondition; \
	void* waiterData; \
	txMachine* waiterLink;

#define mxUseDefaultBuildKeys 1
#define mxUseDefaultChunkAllocation 1
#define mxUseDefaultSlotAllocation 1
#define mxUseDefaultFindModule 1
#define mxUseDefaultLoadModule 1
#define mxUseDefaultParseScript 1
#define mxUseDefaultSharedChunks 1

#endif /* __XSNAP__ */

// Local Variables:
// tab-width: 4
// c-basic-offset: 4
// indent-tabs-mode: t
// End:
// vim: noet ts=4 sw=4
