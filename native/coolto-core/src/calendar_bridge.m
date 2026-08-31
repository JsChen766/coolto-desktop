#import <EventKit/EventKit.h>
#import <Foundation/Foundation.h>
#include <stdlib.h>
#include <string.h>

static dispatch_queue_t CooltoCalendarQueue(void) {
  static dispatch_queue_t queue;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ queue = dispatch_queue_create("com.coolto.calendar", DISPATCH_QUEUE_SERIAL); });
  return queue;
}

static EKEventStore *CooltoCalendarStore(void) {
  static EKEventStore *store;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ store = [[EKEventStore alloc] init]; });
  return store;
}

static char *CooltoJSON(NSDictionary *value) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  return strdup(json.UTF8String ?: "{\"ok\":false,\"error\":\"encode_failed\"}");
}

static NSDictionary *CooltoError(NSString *message) {
  return @{ @"ok": @NO, @"error": message ?: @"EventKit 操作失败" };
}

static NSDictionary *CooltoInput(const char *input) {
  if (!input) return nil;
  NSData *data = [[NSString stringWithUTF8String:input] dataUsingEncoding:NSUTF8StringEncoding];
  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [value isKindOfClass:NSDictionary.class] ? value : nil;
}

static NSDate *CooltoDate(NSString *value) {
  if (![value isKindOfClass:NSString.class]) return nil;
  NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime |
    NSISO8601DateFormatWithFractionalSeconds;
  NSDate *date = [formatter dateFromString:value];
  if (date) return date;
  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime;
  return [formatter dateFromString:value];
}

static BOOL CooltoApply(EKEvent *event, NSDictionary *input, NSString **error) {
  NSString *title = input[@"title"];
  NSDate *start = CooltoDate(input[@"startAt"]);
  NSDate *end = CooltoDate(input[@"endAt"]);
  NSTimeZone *timezone = [NSTimeZone timeZoneWithName:input[@"timezone"]];
  if (![title isKindOfClass:NSString.class] || !start || !end || !timezone) {
    if (error) *error = @"Calendar event 内容无效";
    return NO;
  }
  event.title = title;
  event.startDate = start;
  event.endDate = end;
  event.timeZone = timezone;
  event.location = [input[@"location"] isKindOfClass:NSString.class] ? input[@"location"] : nil;
  NSString *meeting = input[@"meetingUrl"];
  event.URL = [meeting isKindOfClass:NSString.class] ? [NSURL URLWithString:meeting] : nil;
  event.notes = [input[@"notes"] isKindOfClass:NSString.class] ? input[@"notes"] : nil;
  event.alarms = nil;
  NSArray *offsets = input[@"alarmOffsetsMinutes"];
  if ([offsets isKindOfClass:NSArray.class]) {
    for (id value in offsets) {
      if ([value isKindOfClass:NSNumber.class]) {
        [event addAlarm:[EKAlarm alarmWithRelativeOffset:[value doubleValue] * 60.0]];
      }
    }
  }
  return YES;
}

static NSDictionary *CooltoIdentity(EKEvent *event) {
  return @{ @"ok": @YES,
    @"eventIdentifier": event.eventIdentifier ?: @"",
    @"calendarIdentifier": event.calendar.calendarIdentifier ?: [NSNull null] };
}

int coolto_calendar_authorization_status(void) {
  EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
  if (@available(macOS 14.0, *)) {
    if (status == EKAuthorizationStatusWriteOnly) return 3;
    if (status == EKAuthorizationStatusFullAccess) return 4;
  }
  if (status == EKAuthorizationStatusAuthorized) return 4;
  if (status == EKAuthorizationStatusDenied) return 2;
  if (status == EKAuthorizationStatusRestricted) return 1;
  return 0;
}

char *coolto_calendar_request_access(int full_access) {
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  __block BOOL granted = NO;
  __block NSError *requestError;
  dispatch_async(CooltoCalendarQueue(), ^{
    void (^completion)(BOOL, NSError *) = ^(BOOL value, NSError *error) {
      granted = value; requestError = error; dispatch_semaphore_signal(semaphore);
    };
    if (@available(macOS 14.0, *)) {
      if (full_access) {
        [CooltoCalendarStore() requestFullAccessToEventsWithCompletion:completion];
      } else {
        [CooltoCalendarStore() requestWriteOnlyAccessToEventsWithCompletion:completion];
      }
    } else {
      [CooltoCalendarStore() requestAccessToEntityType:EKEntityTypeEvent completion:completion];
    }
  });
  dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
  if (!granted) return CooltoJSON(CooltoError(requestError.localizedDescription));
  return CooltoJSON(@{ @"ok": @YES,
    @"status": @(coolto_calendar_authorization_status()) });
}

char *coolto_calendar_create_event(const char *json) {
  NSDictionary *input = CooltoInput(json);
  if (!input) return CooltoJSON(CooltoError(@"Calendar event 输入无效"));
  __block NSDictionary *result;
  dispatch_sync(CooltoCalendarQueue(), ^{
    EKEvent *event = [EKEvent eventWithEventStore:CooltoCalendarStore()];
    NSString *message;
    if (!CooltoApply(event, input, &message)) { result = CooltoError(message); return; }
    event.calendar = CooltoCalendarStore().defaultCalendarForNewEvents;
    NSError *error;
    result = [CooltoCalendarStore() saveEvent:event span:EKSpanThisEvent error:&error]
      ? CooltoIdentity(event) : CooltoError(error.localizedDescription);
  });
  return CooltoJSON(result);
}

char *coolto_calendar_update_event(const char *json) {
  NSDictionary *input = CooltoInput(json);
  NSString *identifier = input[@"eventIdentifier"];
  if (!input || ![identifier isKindOfClass:NSString.class]) {
    return CooltoJSON(CooltoError(@"Calendar update 输入无效"));
  }
  __block NSDictionary *result;
  dispatch_sync(CooltoCalendarQueue(), ^{
    EKEvent *event = [CooltoCalendarStore() eventWithIdentifier:identifier];
    if (!event) { result = CooltoError(@"系统日历事件不存在或不可读取"); return; }
    NSString *message;
    if (!CooltoApply(event, input, &message)) { result = CooltoError(message); return; }
    NSError *error;
    result = [CooltoCalendarStore() saveEvent:event span:EKSpanThisEvent error:&error]
      ? CooltoIdentity(event) : CooltoError(error.localizedDescription);
  });
  return CooltoJSON(result);
}

char *coolto_calendar_cancel_event(const char *identifier) {
  if (!identifier) return CooltoJSON(CooltoError(@"Calendar event ID 无效"));
  NSString *eventId = [NSString stringWithUTF8String:identifier];
  __block NSDictionary *result;
  dispatch_sync(CooltoCalendarQueue(), ^{
    EKEvent *event = [CooltoCalendarStore() eventWithIdentifier:eventId];
    if (!event) { result = CooltoError(@"系统日历事件不存在或不可读取"); return; }
    NSError *error;
    result = [CooltoCalendarStore() removeEvent:event span:EKSpanThisEvent error:&error]
      ? @{ @"ok": @YES } : CooltoError(error.localizedDescription);
  });
  return CooltoJSON(result);
}

void coolto_calendar_free(char *value) { free(value); }
