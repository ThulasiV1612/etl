import { type RefObject, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "@studio-freight/lenis"

gsap.registerPlugin(ScrollTrigger)

export function useFiles2Landing(
  rootRef: RefObject<HTMLElement | null>,
  reducedMotion: boolean | null,
) {
  useEffect(() => {
    const mount = rootRef.current
    if (!mount) return
    const container: HTMLElement = mount

    if (reducedMotion) {
      container.classList.remove("loading")
      const pl = container.querySelector<HTMLElement>("#preloader")
      if (pl) pl.style.display = "none"
      gsap.set([".sec-h2", ".sec-label", ".scroll-in"], { opacity: 1, y: 0, x: 0 })
      return
    }

    let lenis: Lenis | null = null
    let lenisRafId = 0
    const intervals: number[] = []
    const scrollTriggers: ScrollTrigger[] = []

    const addInterval = (id: number) => {
      intervals.push(id)
    }

    ScrollTrigger.config({ limitCallbacks: true })

    /* Lenis smooth scroll — duration-based on a single RAF loop */
    lenis = new Lenis({
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,
    })

    const lenisRaf = (time: number) => {
      lenis?.raf(time)
      lenisRafId = requestAnimationFrame(lenisRaf)
    }
    lenisRafId = requestAnimationFrame(lenisRaf)

    lenis.on("scroll", ScrollTrigger.update)
    gsap.ticker.lagSmoothing(0)
    document.documentElement.classList.add("files2-landing-page")
    document.body.classList.add("files2-landing-page")

    const onExternalMenuClose = () => lenis?.start()
    container.addEventListener("files2:close-menu", onExternalMenuClose)

    const scrollEasing = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t))

    const scrollToLandingSection = (sectionId: string) => {
      const target = document.getElementById(sectionId)
      if (!target) return
      lenis?.scrollTo(target, { offset: -86, duration: 1.4, easing: scrollEasing })
    }

    const onScrollToSection = (event: Event) => {
      const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId
      if (!sectionId) return
      scrollToLandingSection(sectionId)
    }
    container.addEventListener("files2:scroll-to", onScrollToSection as EventListener)

    const onAnchorClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
        'a[href^="#"]',
      )
      if (!link || !container.contains(link)) return
      const hash = link.getAttribute("href")
      if (!hash || hash === "#") return
      const target = document.querySelector<HTMLElement>(hash)
      if (!target) return
      event.preventDefault()
      lenis?.scrollTo(target, { offset: -86, duration: 1.4, easing: scrollEasing })
    }
    container.addEventListener("click", onAnchorClick)

    function initMagnetic() {
      const els = container.querySelectorAll<HTMLElement>(".magnetic")
      const handlers: Array<{ el: HTMLElement; onMove: (e: MouseEvent) => void; onLeave: () => void }> =
        []

      els.forEach((el) => {
        const onMove = (e: MouseEvent) => {
          const r = el.getBoundingClientRect()
          const dx = e.clientX - (r.left + r.width / 2)
          const dy = e.clientY - (r.top + r.height / 2)
          gsap.to(el, { x: dx * 0.3, y: dy * 0.3, duration: 0.45, ease: "power2.out" })
        }
        const onLeave = () =>
          gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1,0.55)" })
        el.addEventListener("mousemove", onMove)
        el.addEventListener("mouseleave", onLeave)
        handlers.push({ el, onMove, onLeave })
      })

      return () => {
        handlers.forEach(({ el, onMove, onLeave }) => {
          el.removeEventListener("mousemove", onMove)
          el.removeEventListener("mouseleave", onLeave)
        })
      }
    }

    function heroEntrance() {
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } })
      tl.fromTo(".nav-wrap", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.7 })
      tl.fromTo(
        ".hero-badge",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.7 },
        "-=0.3",
      )
      tl.fromTo(
        ".hl",
        { yPercent: 110, opacity: 0 },
        { yPercent: 0, opacity: 1, stagger: 0.1, duration: 1.1 },
        "-=0.3",
      )
      tl.fromTo(".hero-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8 }, "-=0.7")
      tl.fromTo(".hero-btns", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.5")
      tl.fromTo(".hero-stats", { opacity: 0 }, { opacity: 1, duration: 0.6 }, "-=0.4")
      tl.fromTo(".hero-scroll", { opacity: 0 }, { opacity: 1, duration: 0.5 }, "-=0.3")
      tl.call(() => initMagnetic())
    }

    function initPreloader() {
      const pl = container.querySelector<HTMLElement>("#preloader")
      const countEl = container.querySelector<HTMLElement>("#pre-count")
      const bar = container.querySelector<HTMLElement>("#pre-bar")
      if (!pl || !countEl || !bar) {
        heroEntrance()
        return () => undefined
      }

      container.classList.add("loading")
      let n = 0
      const total = 100
      const duration = 2000
      const step = duration / total

      const iv = window.setInterval(() => {
        n++
        countEl.textContent = String(n)
        bar.style.width = `${n}%`
        if (n >= total) {
          window.clearInterval(iv)
          window.setTimeout(() => {
            gsap.to(pl, {
              yPercent: -100,
              duration: 0.95,
              ease: "power3.inOut",
              onComplete: () => {
                pl.style.display = "none"
                container.classList.remove("loading")
                heroEntrance()
              },
            })
          }, 200)
        }
      }, step)
      addInterval(iv)

      return () => window.clearInterval(iv)
    }

    function initNavbar() {
      const navbar = container.querySelector<HTMLElement>("#navbar")
      const hamburger = container.querySelector<HTMLElement>("#hamburger")
      const mmenu = container.querySelector<HTMLElement>("#mmenu")
      if (!navbar || !hamburger || !mmenu || !lenis) return () => undefined

      const st = ScrollTrigger.create({
        start: "top -60px",
        onEnter: () => navbar.classList.add("scrolled"),
        onLeaveBack: () => navbar.classList.remove("scrolled"),
      })
      scrollTriggers.push(st)

      const onHam = () => {
        const open = mmenu.classList.toggle("open")
        hamburger.classList.toggle("open")
        container.classList.toggle("menu-open")
        if (open) {
          lenis?.stop()
          gsap.from(".mlink", {
            yPercent: 100,
            opacity: 0,
            stagger: 0.07,
            duration: 0.55,
            ease: "power3.out",
            delay: 0.1,
          })
        } else {
          lenis?.start()
        }
      }
      hamburger.addEventListener("click", onHam)

      const mlinks = container.querySelectorAll<HTMLElement>(".mlink")
      const closeMenu = () => {
        mmenu.classList.remove("open")
        hamburger.classList.remove("open")
        container.classList.remove("menu-open")
        lenis?.start()
      }
      mlinks.forEach((link) => link.addEventListener("click", closeMenu))

      return () => {
        hamburger.removeEventListener("click", onHam)
        mlinks.forEach((link) => link.removeEventListener("click", closeMenu))
        st.kill()
      }
    }

    function revealOnScroll(selector: string, start = "top 88%") {
      container.querySelectorAll(selector).forEach((el) => {
        gsap.set(el, { opacity: 0, y: 0, x: 0, scale: 1 })
        const st = ScrollTrigger.create({
          trigger: el,
          start,
          once: true,
          fastScrollEnd: true,
          animation: gsap.to(el, {
            opacity: 1,
            duration: 0.5,
            ease: "power2.out",
          }),
        })
        scrollTriggers.push(st)
      })
    }

    function initScrollAnims() {
      /* Opacity-only reveals — transform slides fought Lenis and looked broken between sections */
      revealOnScroll(".scroll-in", "top 90%")
      revealOnScroll(".sec-h2", "top 88%")
      revealOnScroll(".sec-label", "top 92%")
    }

    function initCounters() {
      container.querySelectorAll<HTMLElement>(".cnt").forEach((el) => {
        const target = parseFloat(el.dataset.target ?? "0")
        const isFloat = el.dataset.float === "true"
        const st = ScrollTrigger.create({
          trigger: el,
          start: "top 85%",
          once: true,
          onEnter: () => {
            gsap.to(
              { val: 0 },
              {
                val: target,
                duration: 2,
                ease: "power2.out",
                onUpdate: function onUpdate() {
                  const v = (this.targets()[0] as { val: number }).val
                  el.textContent = isFloat ? v.toFixed(1) : String(Math.round(v))
                },
              },
            )
          },
        })
        scrollTriggers.push(st)
      })
    }

    function initSecurityAnim() {
      const section = container.querySelector(".security-section")
      if (!section) return

      const badgeCards = section.querySelectorAll(".badge-card")
      const trustItems = section.querySelectorAll(".trust-bar .tb-item")
      gsap.set([...badgeCards, ...trustItems], { opacity: 0, y: 0, scale: 1 })

      const st = ScrollTrigger.create({
        trigger: section,
        start: "top 75%",
        once: true,
        fastScrollEnd: true,
        onEnter: () => {
          gsap.to(badgeCards, {
            opacity: 1,
            duration: 0.45,
            stagger: 0.08,
            ease: "power2.out",
          })
          gsap.to(trustItems, {
            opacity: 1,
            duration: 0.4,
            stagger: 0.07,
            ease: "power2.out",
            delay: 0.15,
          })
        },
      })
      scrollTriggers.push(st)
    }

    const cleanups = [
      initPreloader(),
      initNavbar(),
      initScrollAnims(),
      initCounters(),
      initSecurityAnim(),
    ]

    const onResize = () => {
      lenis?.resize()
      ScrollTrigger.refresh()
    }
    window.addEventListener("resize", onResize)

    const onWindowLoad = () => {
      lenis?.resize()
      ScrollTrigger.refresh()
    }
    window.addEventListener("load", onWindowLoad)
    requestAnimationFrame(() => {
      lenis?.resize()
      ScrollTrigger.refresh()
    })

    return () => {
      window.removeEventListener("load", onWindowLoad)
      window.removeEventListener("resize", onResize)
      container.removeEventListener("files2:close-menu", onExternalMenuClose)
      container.removeEventListener("files2:scroll-to", onScrollToSection as EventListener)
      container.removeEventListener("click", onAnchorClick)
      document.documentElement.classList.remove("files2-landing-page")
      document.body.classList.remove("files2-landing-page")
      intervals.forEach((id) => window.clearInterval(id))
      cancelAnimationFrame(lenisRafId)
      scrollTriggers.forEach((st) => st.kill())
      ScrollTrigger.getAll().forEach((st) => st.kill())
      cleanups.forEach((fn) => fn?.())
      lenis?.destroy()
      lenis = null
      container.classList.remove("loading", "menu-open")
    }
  }, [rootRef, reducedMotion])
}
