package it.unina.bugboard26.backend.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    @GetMapping("/")
    public String home() {
        // Inoltra la richiesta alla pagina statica index.html
        return "forward:/index.html";
    }
}
