import { useEffect, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { CheckCircle2, LifeBuoy, Loader2, Send, TriangleAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select } from '../components/ui/select'
import { Form, FormDescription, FormItem, FormLabel, FormMessage } from '../components/ui/form'

const CATEGORIES = ['Bug Report', 'Feature Suggestion', 'General Issue'] as const

type CategoryType = (typeof CATEGORIES)[number]

type FormErrors = {
  email?: string
  category?: string
  subject?: string
  message?: string
}

type ToastState = {
  open: boolean
  tone: 'success' | 'error'
  message: string
}

const INITIAL_TOAST: ToastState = {
  open: false,
  tone: 'success',
  message: ''
}

export default function SupportFeedbackScreen() {
  const { user } = useUser()

  const accountEmail = user?.primaryEmailAddress?.emailAddress?.trim() || ''
  const emailLocked = accountEmail.length > 0

  const [email, setEmail] = useState(accountEmail)
  const [category, setCategory] = useState<CategoryType>('General Issue')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<ToastState>(INITIAL_TOAST)

  useEffect(() => {
    if (emailLocked) {
      setEmail(accountEmail)
    }
  }, [accountEmail, emailLocked])

  useEffect(() => {
    if (!toast.open) {
      return
    }

    const timer = window.setTimeout(() => {
      setToast((previous) => ({ ...previous, open: false }))
    }, 2800)

    return () => {
      window.clearTimeout(timer)
    }
  }, [toast.open])

  const showToast = (tone: 'success' | 'error', messageText: string) => {
    setToast({
      open: true,
      tone,
      message: messageText
    })
  }

  const validate = (): boolean => {
    const nextErrors: FormErrors = {}

    const trimmedEmail = email.trim()
    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()

    if (!trimmedEmail) {
      nextErrors.email = 'Email is required.'
    } else if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      nextErrors.email = 'Please enter a valid email address.'
    }

    if (!category) {
      nextErrors.category = 'Please select a category.'
    }

    if (!trimmedSubject) {
      nextErrors.subject = 'Subject is required.'
    }

    if (!trimmedMessage) {
      nextErrors.message = 'Message is required.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (sending) {
      return
    }

    if (!validate()) {
      return
    }

    if (!window.api?.sendTelegramSupport) {
      showToast('error', 'Support service is unavailable right now.')
      return
    }

    setSending(true)

    try {
      await window.api.sendTelegramSupport({
        email: email.trim(),
        category,
        subject: subject.trim(),
        message: message.trim()
      })

      showToast('success', 'Message sent successfully!')
      setSubject('')
      setMessage('')
      setCategory('General Issue')
      if (!emailLocked) {
        setEmail('')
      }
      setErrors({})
    } catch (error) {
      console.error(error)
      const reason = error instanceof Error ? error.message : 'Unable to send message. Please try again.'
      showToast('error', reason)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative mx-auto max-w-3xl space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
          <LifeBuoy className="h-5 w-5 text-indigo-300" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Help & Feedback</h1>
          <p className="text-zinc-400">Send bug reports and ideas directly to our support team.</p>
        </div>
      </div>

      <Card className="border-zinc-800 bg-[#121214]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">Contact Support</CardTitle>
          <CardDescription>Share your issue and we will review it quickly.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form onSubmit={handleSubmit}>
            <FormItem>
              <FormLabel htmlFor="support-email">Email</FormLabel>
              <Input
                id="support-email"
                type="email"
                value={email}
                readOnly={emailLocked}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              {emailLocked && <FormDescription>Email fetched from your signed-in account.</FormDescription>}
              {errors.email ? <FormMessage>{errors.email}</FormMessage> : null}
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="support-category">Category</FormLabel>
              <Select
                id="support-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as CategoryType)}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {errors.category ? <FormMessage>{errors.category}</FormMessage> : null}
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="support-subject">Subject</FormLabel>
              <Input
                id="support-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Short summary of your issue"
              />
              {errors.subject ? <FormMessage>{errors.subject}</FormMessage> : null}
            </FormItem>

            <FormItem>
              <FormLabel htmlFor="support-message">Message</FormLabel>
              <Textarea
                id="support-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Describe what happened, expected behavior, and any useful details."
                className="min-h-[160px]"
              />
              {errors.message ? <FormMessage>{errors.message}</FormMessage> : null}
            </FormItem>

            <div className="space-y-2 pt-1">
              <Button type="submit" disabled={sending} className="w-full sm:w-auto">
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Message
                  </>
                )}
              </Button>
              <p className="text-sm text-zinc-500">We will email you as soon as we review your message.</p>
            </div>
          </Form>
        </CardContent>
      </Card>

      {toast.open ? (
        <div
          className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-2xl ${
            toast.tone === 'success'
              ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
              : 'border-rose-400/30 bg-rose-500/15 text-rose-200'
          }`}
        >
          {toast.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </div>
  )
}
